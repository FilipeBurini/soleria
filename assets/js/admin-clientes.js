/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Módulo de CRM e Gestão de Clientes do Painel Administrativo
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Guarda de rota autenticada
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const adminUserEmail = document.getElementById('admin-user-email');
  if (adminUserEmail) adminUserEmail.textContent = currentUser.email || 'Operador Autenticado';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logoutAdmin();
    });
  }

  // Elementos do DOM
  const kpiTotal = document.getElementById('kpi-customers-total');
  const kpiActive = document.getElementById('kpi-customers-active');
  const kpiConversion = document.getElementById('kpi-customers-conversion');
  const kpiAvgLtv = document.getElementById('kpi-customers-avg-ltv');
  const kpiTotalRev = document.getElementById('kpi-customers-total-revenue');

  const searchInput = document.getElementById('admin-customer-search');
  const segmentFilter = document.getElementById('admin-customer-segment-filter');
  const btnRefresh = document.getElementById('btn-refresh-customers');
  const btnExport = document.getElementById('btn-export-customers-csv');

  const spinner = document.getElementById('customers-spinner');
  const emptyState = document.getElementById('customers-empty-state');
  const tableContainer = document.getElementById('customers-table-container');
  const tableBody = document.getElementById('customers-table-body');

  const ordersModal = document.getElementById('customer-orders-modal');
  const btnCloseModal = document.getElementById('btn-close-customer-orders-modal');
  const modalContent = document.getElementById('customer-orders-modal-content');

  let rawCustomers = [];
  let rawOrders = [];
  let enrichedCustomers = [];

  function formatMoney(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatCPF(raw) {
    if (!raw) return '—';
    const c = String(raw).replace(/\D/g, '');
    if (c.length !== 11) return raw;
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  }

  function formatPhone(raw) {
    if (!raw) return '—';
    const d = String(raw).replace(/\D/g, '');
    if (d.length === 11) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return raw;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function getInitials(name) {
    if (!name) return 'SO';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ==========================================================================
  // Carregamento de Dados (Supabase + LocalStorage Fallback)
  // ==========================================================================

  async function loadData() {
    spinner.style.display = 'block';
    emptyState.style.display = 'none';
    tableContainer.style.display = 'none';

    try {
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) ||
                     (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

      let customers = [];
      let orders = [];

      if (client && isSupabaseConfigured()) {
        try {
          const [custRes, ordRes] = await Promise.all([
            client.from('customers').select('*').order('created_at', { ascending: false }),
            client.from('orders').select('*').order('created_at', { ascending: false })
          ]);

          if (custRes.data && Array.isArray(custRes.data)) {
            customers = custRes.data;
          }
          if (ordRes.data && Array.isArray(ordRes.data)) {
            orders = ordRes.data;
          }
        } catch (dbErr) {
          console.warn('Falha ao carregar do Supabase, recorrendo a cópias locais:', dbErr);
        }
      }

      // Fallback ou merge com localStorage
      try {
        const localCust = JSON.parse(localStorage.getItem('soleria_customers') || '[]');
        if (Array.isArray(localCust) && localCust.length > 0) {
          localCust.forEach(lc => {
            if (!customers.some(c => c.cpf === lc.cpf)) {
              customers.push(lc);
            }
          });
        }
      } catch (e) {}

      try {
        const localOrd = JSON.parse(localStorage.getItem('soleria_orders') || '[]');
        if (Array.isArray(localOrd) && localOrd.length > 0) {
          localOrd.forEach(lo => {
            if (!orders.some(o => o.order_number === lo.order_number)) {
              orders.push(lo);
            }
          });
        }
      } catch (e) {}

      rawCustomers = customers;
      rawOrders = orders;

      // Consolidação de clientes e pedidos (LTV, total gasto, histórico)
      consolidateCustomerData();
      renderKPIs();
      renderTable();
    } catch (err) {
      console.error('Erro ao processar dados do CRM:', err);
      showToast('Erro ao carregar lista de clientes.', 'error');
    } finally {
      spinner.style.display = 'none';
    }
  }

  /**
   * Consolida métricas de compras por cliente
   */
  function consolidateCustomerData() {
    // Mapeamento de clientes por CPF e por Telefone
    const ordersByCpf = new Map();
    const ordersByPhone = new Map();

    rawOrders.forEach(o => {
      const cleanCpf = o.customer_cpf ? String(o.customer_cpf).replace(/\D/g, '') : '';
      const cleanPhone = o.customer_phone ? String(o.customer_phone).replace(/\D/g, '').slice(-8) : '';

      if (cleanCpf) {
        if (!ordersByCpf.has(cleanCpf)) ordersByCpf.set(cleanCpf, []);
        ordersByCpf.get(cleanCpf).push(o);
      }
      if (cleanPhone) {
        if (!ordersByPhone.has(cleanPhone)) ordersByPhone.set(cleanPhone, []);
        ordersByPhone.get(cleanPhone).push(o);
      }
    });

    const processedCpfs = new Set();
    enrichedCustomers = [];

    // 1. Processa clientes da tabela customers
    rawCustomers.forEach(c => {
      const cleanCpf = String(c.cpf || '').replace(/\D/g, '');
      const cleanPhone = String(c.phone || '').replace(/\D/g, '').slice(-8);

      let custOrders = [];
      if (cleanCpf && ordersByCpf.has(cleanCpf)) {
        custOrders = ordersByCpf.get(cleanCpf);
      } else if (cleanPhone && ordersByPhone.has(cleanPhone)) {
        custOrders = ordersByPhone.get(cleanPhone);
      }

      // Elimina duplicatas de pedidos
      const uniqueOrdersMap = new Map();
      custOrders.forEach(ord => uniqueOrdersMap.set(ord.order_number, ord));
      const clientOrders = Array.from(uniqueOrdersMap.values());

      const validOrders = clientOrders.filter(o => o.status !== 'cancelado');
      const totalSpent = validOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      enrichedCustomers.push({
        id: c.id,
        name: c.name || 'Cliente Sem Nome',
        cpf: cleanCpf,
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || {},
        created_at: c.created_at || new Date().toISOString(),
        orders: clientOrders,
        orderCount: clientOrders.length,
        validOrderCount: validOrders.length,
        ltv: totalSpent,
        isVip: totalSpent >= 500,
        isFrequent: validOrders.length >= 3
      });

      if (cleanCpf) processedCpfs.add(cleanCpf);
    });

    // 2. Se houver pedidos de clientes que ainda não estavam em customers, cria registros virtuais
    rawOrders.forEach(o => {
      const cleanCpf = o.customer_cpf ? String(o.customer_cpf).replace(/\D/g, '') : '';
      if (cleanCpf && !processedCpfs.has(cleanCpf)) {
        const custOrders = ordersByCpf.get(cleanCpf) || [o];
        const validOrders = custOrders.filter(ord => ord.status !== 'cancelado');
        const totalSpent = validOrders.reduce((acc, ord) => acc + (Number(ord.total_amount) || 0), 0);

        enrichedCustomers.push({
          id: `order-cust-${cleanCpf}`,
          name: o.customer_name || 'Cliente Catálogo',
          cpf: cleanCpf,
          phone: o.customer_phone || '',
          email: o.customer_email || '',
          address: o.customer_address || {},
          created_at: o.created_at || new Date().toISOString(),
          orders: custOrders,
          orderCount: custOrders.length,
          validOrderCount: validOrders.length,
          ltv: totalSpent,
          isVip: totalSpent >= 500,
          isFrequent: validOrders.length >= 3
        });
        processedCpfs.add(cleanCpf);
      }
    });

    // Ordena por maior LTV e pedidos mais recentes
    enrichedCustomers.sort((a, b) => b.ltv - a.ltv || b.orderCount - a.orderCount);
  }

  /**
   * Renderiza os cards de KPI
   */
  function renderKPIs() {
    const total = enrichedCustomers.length;
    const active = enrichedCustomers.filter(c => c.validOrderCount > 0);
    const activeCount = active.length;
    const totalRevenue = active.reduce((acc, c) => acc + c.ltv, 0);
    const avgLtv = activeCount > 0 ? (totalRevenue / activeCount) : 0;
    const conversionRate = total > 0 ? ((activeCount / total) * 100).toFixed(1) : '0';

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiActive) kpiActive.textContent = activeCount;
    if (kpiConversion) kpiConversion.textContent = `Taxa de conversão: ${conversionRate}%`;
    if (kpiAvgLtv) kpiAvgLtv.textContent = formatMoney(avgLtv);
    if (kpiTotalRev) kpiTotalRev.textContent = formatMoney(totalRevenue);
  }

  /**
   * Filtra e renderiza a tabela de clientes
   */
  function renderTable() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const segment = segmentFilter?.value || 'todos';

    const filtered = enrichedCustomers.filter(c => {
      // Filtro de segmento
      if (segment === 'com_pedidos' && c.orderCount === 0) return false;
      if (segment === 'sem_pedidos' && c.orderCount > 0) return false;
      if (segment === 'vip' && !c.isVip) return false;

      // Filtro de texto
      if (q) {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const cpfMatch = (c.cpf || '').includes(q.replace(/\D/g, ''));
        const phoneMatch = (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const emailMatch = (c.email || '').toLowerCase().includes(q);
        const cityMatch = ((c.address?.city || '') + ' ' + (c.address?.neighborhood || '')).toLowerCase().includes(q);
        return nameMatch || cpfMatch || phoneMatch || emailMatch || cityMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      tableContainer.style.display = 'none';
      tableBody.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    let rowsHtml = '';
    filtered.forEach((cust, idx) => {
      const initials = getInitials(cust.name);
      const cleanPhoneDigits = cust.phone.replace(/\D/g, '');
      const waNumber = cleanPhoneDigits.startsWith('55') ? cleanPhoneDigits : `55${cleanPhoneDigits}`;
      const waLink = cleanPhoneDigits ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá, ${cust.name.split(' ')[0]}! Tudo bem? É da Soléria Joias.`)}` : '#';

      let cityText = '—';
      if (cust.address && cust.address.city) {
        cityText = cust.address.city;
      }

      // Badges de Perfil da Cliente
      let profileBadge = '';
      if (cust.isVip) {
        profileBadge = `<span style="background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.68rem; font-weight: 700; margin-left: 0.35rem;">💎 VIP</span>`;
      } else if (cust.isFrequent) {
        profileBadge = `<span style="background: #EEF2FF; color: #3730A3; border: 1px solid #C7D2FE; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.68rem; font-weight: 700; margin-left: 0.35rem;">✨ Frequente</span>`;
      } else if (cust.orderCount > 0) {
        profileBadge = `<span style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.68rem; font-weight: 600; margin-left: 0.35rem;">🛍️ Compradora</span>`;
      } else {
        profileBadge = `<span style="background: #F3F4F6; color: #4B5563; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.68rem; font-weight: 500; margin-left: 0.35rem;">Cadastrada</span>`;
      }

      rowsHtml += `
        <tr style="border-bottom: 1px solid var(--border-light); font-size: 0.84rem; transition: background 0.15s ease;">
          <td style="padding: 0.85rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: #FAF5F0; border: 1.5px solid var(--gold-primary); color: var(--gold-dark); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center;">
                  ${cust.name}
                  ${profileBadge}
                </div>
                <div style="font-size: 0.73rem; color: var(--text-muted); font-family: monospace;">
                  CPF: ${formatCPF(cust.cpf)}
                </div>
              </div>
            </div>
          </td>

          <td style="padding: 0.85rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 500;">
              ${cust.phone ? `
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.3rem; color: #15803d; text-decoration: none; font-weight: 600;" title="Abrir conversa no WhatsApp">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8 2.53 1.09 2.53.73 2.99.69.45-.05 1.47-.6 1.68-1.18.21-.59.21-1.09.15-1.19-.06-.1-.23-.17-.48-.29z"/>
                  </svg>
                  ${formatPhone(cust.phone)}
                </a>
              ` : '<span style="color: var(--text-muted);">Não informado</span>'}
            </div>
            ${cust.email ? `<div style="font-size: 0.73rem; color: var(--text-muted);">${cust.email}</div>` : ''}
          </td>

          <td style="padding: 0.85rem 1rem; color: var(--text-secondary);">
            ${cityText}
          </td>

          <td style="padding: 0.85rem 1rem;">
            <span style="font-weight: 700; color: ${cust.orderCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">
              ${cust.orderCount} ${cust.orderCount === 1 ? 'pedido' : 'pedidos'}
            </span>
          </td>

          <td style="padding: 0.85rem 1rem;">
            <div style="font-weight: 700; color: ${cust.ltv > 0 ? 'var(--brand-terracotta)' : 'var(--text-muted)'}; font-size: 0.9rem;">
              ${formatMoney(cust.ltv)}
            </div>
          </td>

          <td style="padding: 0.85rem 1rem; text-align: center;">
            <div style="display: flex; gap: 0.4rem; justify-content: center;">
              <button type="button" class="btn-secondary-action btn-view-customer-orders" data-idx="${idx}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">
                📋 Pedidos (${cust.orderCount})
              </button>
              ${cleanPhoneDigits ? `
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-primary-action" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; text-decoration: none; background: #16a34a; color: #fff; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.25rem;">
                  WhatsApp
                </a>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = rowsHtml;

    // Conecta botões de histórico
    tableBody.querySelectorAll('.btn-view-customer-orders').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (filtered[idx]) {
          openCustomerOrdersModal(filtered[idx]);
        }
      });
    });
  }

  /**
   * Abre o Modal com Histórico de Compras da Cliente
   */
  function openCustomerOrdersModal(cust) {
    if (!ordersModal || !modalContent) return;

    const initials = getInitials(cust.name);
    const cleanPhoneDigits = cust.phone.replace(/\D/g, '');
    const waNumber = cleanPhoneDigits.startsWith('55') ? cleanPhoneDigits : `55${cleanPhoneDigits}`;
    const waLink = cleanPhoneDigits ? `https://wa.me/${waNumber}` : '#';

    let addressHtml = 'Não cadastrado';
    if (cust.address && cust.address.street) {
      addressHtml = `${cust.address.street}, ${cust.address.number || 'S/N'}${cust.address.complement ? ` - ${cust.address.complement}` : ''} — ${cust.address.neighborhood || ''}, ${cust.address.city || ''} (CEP: ${cust.address.cep || '—'})`;
    }

    let ordersListHtml = '';
    if (cust.orders && cust.orders.length > 0) {
      cust.orders.forEach(ord => {
        const statusMap = {
          recebido: { label: 'Recebido', color: '#92400e', bg: '#fef3c7' },
          confirmado: { label: 'Pago / Confirmado', color: '#166534', bg: '#dcfce7' },
          preparacao: { label: 'Em Preparação', color: '#1e40af', bg: '#dbeafe' },
          enviado: { label: 'Enviado / A Caminho', color: '#6b21a8', bg: '#f3e8ff' },
          entregue: { label: 'Entregue', color: '#065f46', bg: '#d1fae5' },
          cancelado: { label: 'Cancelado', color: '#991b1b', bg: '#fee2e2' }
        };
        const sInfo = statusMap[ord.status] || { label: ord.status, color: '#374151', bg: '#f3f4f6' };

        const itemsStr = Array.isArray(ord.items) 
          ? ord.items.map(it => `${it.quantity}x ${it.name}${it.size ? ` (Aro ${it.size})` : ''}`).join(', ')
          : 'Peças diversas';

        ordersListHtml += `
          <div style="background: #FAF8F5; border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <strong style="color: var(--text-primary); font-size: 0.9rem;">#${ord.order_number}</strong>
                <span style="font-size: 0.74rem; color: var(--text-muted); margin-left: 0.5rem;">${formatDate(ord.created_at)}</span>
              </div>
              <span style="background: ${sInfo.bg}; color: ${sInfo.color}; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px;">
                ${sInfo.label}
              </span>
            </div>
            
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.4rem; line-height: 1.4;">
              <strong>Peças:</strong> ${itemsStr}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; border-top: 1px dashed #e5e0dc; padding-top: 0.4rem; margin-top: 0.4rem;">
              <span style="color: var(--text-muted);">
                ${ord.delivery_type === 'retirada' ? '✨ Retirada Exclusiva' : '🚚 Entrega em Domicílio'}
                ${ord.tracking_code ? ` &bull; Rastreio: <strong>${ord.tracking_code}</strong>` : ''}
              </span>
              <span style="font-weight: 700; color: var(--brand-terracotta); font-size: 0.95rem;">
                ${formatMoney(ord.total_amount)}
              </span>
            </div>
          </div>
        `;
      });
    } else {
      ordersListHtml = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.82rem;">
          Esta cliente ainda não possui compras registradas.
        </div>
      `;
    }

    modalContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-light); padding-bottom: 1.25rem;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #FAF5F0; border: 2px solid var(--gold-primary); color: var(--gold-dark); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; flex-shrink: 0;">
          ${initials}
        </div>
        <div style="flex: 1;">
          <h3 style="font-family: var(--font-serif); font-size: 1.35rem; margin-bottom: 0.2rem; color: var(--text-primary);">
            ${cust.name}
          </h3>
          <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <span>CPF: <strong>${formatCPF(cust.cpf)}</strong></span>
            <span>Telefone: <strong>${formatPhone(cust.phone)}</strong></span>
            <span>Desde: <strong>${formatDate(cust.created_at)}</strong></span>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.25rem;">
        <div style="background: #FDF9F5; border: 1px solid #EFE4DC; border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
          <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block;">Total Gasto (LTV Acumulado)</span>
          <span style="font-size: 1.25rem; font-weight: 700; color: var(--brand-terracotta);">${formatMoney(cust.ltv)}</span>
        </div>
        <div style="background: #FDF9F5; border: 1px solid #EFE4DC; border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
          <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block;">Volume de Compras</span>
          <span style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${cust.orderCount} ${cust.orderCount === 1 ? 'pedido' : 'pedidos'}</span>
        </div>
      </div>

      <div style="margin-bottom: 1.25rem; font-size: 0.8rem; background: #FCFAF8; border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
        <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.25rem;">Endereço de Entrega Principal:</span>
        <span style="color: var(--text-secondary); line-height: 1.4;">${addressHtml}</span>
      </div>

      <div style="margin-bottom: 0.75rem;">
        <h4 style="font-family: var(--font-serif); font-size: 1.05rem; color: var(--text-primary); margin-bottom: 0.5rem;">
          Histórico de Pedidos da Cliente
        </h4>
        ${ordersListHtml}
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
        ${cleanPhoneDigits ? `
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-primary-action" style="padding: 0.55rem 1rem; font-size: 0.8rem; text-decoration: none; background: #16a34a; color: #fff; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem;">
            Conversar no WhatsApp
          </a>
        ` : ''}
        <button type="button" class="btn-secondary-action" id="btn-modal-close-action" style="padding: 0.55rem 1rem; font-size: 0.8rem;">
          Fechar
        </button>
      </div>
    `;

    const btnCloseAct = modalContent.querySelector('#btn-modal-close-action');
    if (btnCloseAct) {
      btnCloseAct.addEventListener('click', () => {
        ordersModal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    ordersModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // ==========================================================================
  // Exportação para Planilha CSV
  // ==========================================================================

  function exportCustomersToCSV() {
    if (enrichedCustomers.length === 0) {
      showToast('Nenhuma cliente disponível para exportar.', 'warning');
      return;
    }

    const headers = [
      'Nome da Cliente',
      'CPF',
      'WhatsApp',
      'E-mail',
      'Cidade',
      'UF',
      'Total de Pedidos',
      'LTV Acumulado (R$)',
      'Classificacao',
      'Data de Cadastro'
    ];

    const rows = enrichedCustomers.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.cpf || ''}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.address?.city || '').replace(/"/g, '""')}"`,
      `"${(c.address?.uf || '').replace(/"/g, '""')}"`,
      c.orderCount,
      c.ltv.toFixed(2),
      c.isVip ? 'VIP' : (c.isFrequent ? 'Frequente' : (c.orderCount > 0 ? 'Compradora' : 'Cadastrada')),
      formatDate(c.created_at)
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `soleria_clientes_crm_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha de clientes exportada com sucesso!', 'success');
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  if (searchInput) searchInput.addEventListener('input', renderTable);
  if (segmentFilter) segmentFilter.addEventListener('change', renderTable);
  if (btnRefresh) btnRefresh.addEventListener('click', loadData);
  if (btnExport) btnExport.addEventListener('click', exportCustomersToCSV);

  if (btnCloseModal && ordersModal) {
    btnCloseModal.addEventListener('click', () => {
      ordersModal.classList.remove('active');
      document.body.style.overflow = '';
    });

    ordersModal.addEventListener('click', (e) => {
      if (e.target === ordersModal) {
        ordersModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // Inicializa
  loadData();
});
