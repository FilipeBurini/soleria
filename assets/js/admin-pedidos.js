/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Gestão de Pedidos no Painel Administrativo
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Guarda de rota autenticada compartilhada com o Admin
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

  // Elementos de Pedidos e KPIs
  const kpiRecebidos = document.getElementById('kpi-orders-recebidos');
  const kpiPreparando = document.getElementById('kpi-orders-preparando');
  const kpiRevenue = document.getElementById('kpi-orders-revenue');
  const kpiTotalCount = document.getElementById('kpi-orders-total-count');

  const searchInput = document.getElementById('admin-order-search');
  const statusFilter = document.getElementById('admin-order-status-filter');
  const btnRefresh = document.getElementById('btn-refresh-orders');
  const ordersSpinner = document.getElementById('orders-spinner');
  const ordersEmptyState = document.getElementById('orders-empty-state');
  const ordersListContainer = document.getElementById('orders-list-container');

  // Modal de Gestão
  const manageModal = document.getElementById('order-manage-modal');
  const btnCloseModal = document.getElementById('btn-close-manage-modal');
  const modalContent = document.getElementById('order-manage-modal-content');

  let rawOrders = [];

  function formatMoney(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return 'Recente';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Mapas para resolução dinâmica de SKU em pedidos anteriores
  const catalogProductsById = new Map();
  const catalogProductsByName = new Map();

  function resolveItemSku(item) {
    if (!item) return 'SEM-SKU';
    if (item.sku && item.sku !== 'N/A' && item.sku.trim() !== '') {
      return item.sku.trim();
    }
    if (item.id && catalogProductsById.has(item.id)) {
      return catalogProductsById.get(item.id);
    }
    const cleanName = (item.name || '').trim().toLowerCase();
    if (cleanName && catalogProductsByName.has(cleanName)) {
      return catalogProductsByName.get(cleanName);
    }
    for (const [nameKey, sku] of catalogProductsByName.entries()) {
      if (cleanName.includes(nameKey) || nameKey.includes(cleanName)) {
        return sku;
      }
    }
    return item.sku && item.sku !== 'N/A' ? item.sku : 'SEM-SKU';
  }

  // ==========================================================================
  // Carregamento de Pedidos (Supabase + Fallback Local)
  // ==========================================================================

  async function loadOrders() {
    ordersSpinner.style.display = 'block';
    ordersEmptyState.style.display = 'none';
    ordersListContainer.innerHTML = '';

    try {
      let orders = [];

      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) ||
                     (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

      if (client && isSupabaseConfigured()) {
        // Carrega produtos do catálogo para enriquecer SKUs faltantes em pedidos antigos
        try {
          const { data: prods } = await client
            .from('products')
            .select('id, name, sku');
          if (prods && Array.isArray(prods)) {
            prods.forEach(p => {
              if (p.id && p.sku) catalogProductsById.set(p.id, p.sku);
              if (p.name && p.sku) catalogProductsByName.set(p.name.trim().toLowerCase(), p.sku);
            });
          }
        } catch (pe) {
          console.warn('Aviso ao sincronizar catálogo para SKU nos pedidos:', pe);
        }

        const { data, error } = await client
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Tabela orders não encontrada no Supabase ou sem permissão:', error);
        } else if (data) {
          orders = data;
        }
      }

      // Mescla com pedidos do LocalStorage se houver
      try {
        const local = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
        if (local && local.length > 0) {
          local.forEach(loc => {
            if (!orders.some(o => o.order_number === loc.order_number)) {
              orders.push(loc);
            }
          });
        }
      } catch (e) {}

      rawOrders = orders;
      renderOrders();
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
      showToast('Falha ao carregar lista de pedidos.', 'error');
    } finally {
      ordersSpinner.style.display = 'none';
    }
  }

  // ==========================================================================
  // Renderização e Filtros
  // ==========================================================================

  function getStatusInfo(status) {
    switch ((status || '').toLowerCase()) {
      case 'recebido': return { label: 'Recebido', class: 'status-recebido' };
      case 'confirmado': return { label: 'Pagamento Confirmado', class: 'status-confirmado' };
      case 'preparacao': return { label: 'Em Preparação', class: 'status-preparacao' };
      case 'enviado': return { label: 'Enviado / A Caminho', class: 'status-enviado' };
      case 'entregue': return { label: 'Entregue', class: 'status-entregue' };
      case 'cancelado': return { label: 'Cancelado', class: 'status-cancelado' };
      default: return { label: status || 'Recebido', class: 'status-recebido' };
    }
  }

  function renderOrders() {
    const q = (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const selectedStatus = (statusFilter ? statusFilter.value : 'todos');

    const filtered = rawOrders.filter(order => {
      const matchStatus = selectedStatus === 'todos' || (order.status && order.status.toLowerCase() === selectedStatus.toLowerCase());

      const qDigits = q.replace(/\D/g, '');
      const oDigits = (order.customer_phone || '').replace(/\D/g, '');
      const matchPhone = (order.customer_phone && order.customer_phone.toLowerCase().includes(q)) ||
                         (qDigits.length >= 4 && oDigits.includes(qDigits));

      const items = Array.isArray(order.items) ? order.items : [];
      const matchSearch = !q ||
        (order.order_number && order.order_number.toLowerCase().includes(q)) ||
        (order.customer_name && order.customer_name.toLowerCase().includes(q)) ||
        (order.customer_cpf && (order.customer_cpf.includes(qDigits) || order.customer_cpf.includes(q))) ||
        matchPhone ||
        items.some(it => {
          const s = resolveItemSku(it).toLowerCase();
          return s.includes(q) || (it.sku && it.sku.toLowerCase().includes(q)) || (it.name && it.name.toLowerCase().includes(q));
        });

      return matchStatus && matchSearch;
    });

    // 1. Atualiza KPIs
    let countRecebidos = 0;
    let countPreparando = 0;
    let totalRevenue = 0;

    rawOrders.forEach(o => {
      const st = (o.status || '').toLowerCase();
      if (st === 'recebido') countRecebidos++;
      if (st === 'confirmado' || st === 'preparacao' || st === 'enviado') countPreparando++;
      if (st !== 'cancelado') totalRevenue += Number(o.total_amount || o.subtotal || 0);
    });

    if (kpiRecebidos) kpiRecebidos.textContent = countRecebidos;
    if (kpiPreparando) kpiPreparando.textContent = countPreparando;
    if (kpiRevenue) kpiRevenue.textContent = formatMoney(totalRevenue);
    if (kpiTotalCount) kpiTotalCount.textContent = `${rawOrders.length} pedidos no total`;

    ordersListContainer.innerHTML = '';

    if (filtered.length === 0) {
      ordersEmptyState.style.display = 'block';
      return;
    }

    ordersEmptyState.style.display = 'none';

    filtered.forEach(order => {
      const stInfo = getStatusInfo(order.status);
      const items = Array.isArray(order.items) ? order.items : [];
      const totalPieces = items.reduce((acc, i) => acc + (i.quantity || 1), 0);
      const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
      const waLink = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(`Olá, ${order.customer_name}! Aqui é da Soléria referente ao seu pedido *${order.order_number}*.`)}`;

      const card = document.createElement('div');
      card.className = 'admin-order-card';

      // Resumo visual das peças
      const itemsPreview = items.map(i => {
        const aroText = i.size ? ` <span style="color: var(--brand-terracotta); font-weight: 600;">(Aro ${i.size})</span>` : '';
        const skuVal = resolveItemSku(i);
        const skuText = ` <span style="font-family: monospace; font-size: 0.72rem; color: var(--brand-terracotta); font-weight: 700; background: rgba(197, 164, 101, 0.12); padding: 1px 6px; border-radius: 3px; border: 1px solid rgba(197, 164, 101, 0.25);">[SKU: ${skuVal}]</span>`;
        return `• ${i.quantity}x ${i.name}${aroText}${skuText}`;
      }).join('<br>');

      card.innerHTML = `
        <div class="admin-order-header">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span class="admin-order-number">${order.order_number}</span>
            <span class="order-badge ${stInfo.class}">${stInfo.label}</span>
            ${order.stock_deducted 
              ? `<span class="badge-stock-ok">✓ Baixa Confirmada pelo Admin</span>`
              : `<span class="badge-stock-pending">⚠️ Aguardando Baixa do Admin</span>`
            }
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(order.created_at)}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.82rem;">
          <div>
            <strong style="color: var(--text-primary); font-size: 0.9rem;">${order.customer_name}</strong>
            <div style="color: var(--text-secondary); margin-top: 0.2rem;">
              WhatsApp: <strong>${order.customer_phone}</strong>
            </div>
            ${order.customer_cpf ? `
              <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 0.15rem; font-family: monospace;">
                CPF: ${order.customer_cpf}
              </div>
            ` : ''}
            <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 0.15rem;">
              ${order.delivery_type === 'retirada' ? '✨ Retirada no Local' : '🚚 Envio em Domicílio'}
            </div>
          </div>

          <div style="color: var(--text-secondary); font-size: 0.8rem; line-height: 1.4;">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.2rem;">Peças (${totalPieces}):</div>
            ${itemsPreview}
          </div>

          <div style="text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;">
            <div>
              <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Total</span>
              <div style="font-size: 1.15rem; font-weight: 700; color: var(--gold-dark);">${formatMoney(order.total_amount)}</div>
              ${order.discount_amount > 0 ? `<div style="font-size: 0.72rem; color: #16A34A; font-weight: 600;">Desconto: -${formatMoney(order.discount_amount)}</div>` : ''}
            </div>
            
            <div style="display: flex; gap: 0.4rem; margin-top: 0.5rem;">
              <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-secondary-action" style="font-size: 0.75rem; padding: 0.4rem 0.65rem; color: #16A34A; border-color: #86EFAC;" title="Chamar cliente no WhatsApp">
                💬 WhatsApp
              </a>
              <button type="button" class="btn-primary btn-manage-order" data-id="${order.order_number}" style="font-size: 0.75rem; padding: 0.4rem 0.85rem;">
                Gerenciar Pedido &rarr;
              </button>
            </div>
          </div>
        </div>
      `;

      card.querySelector('.btn-manage-order').addEventListener('click', () => {
        openOrderManageModal(order);
      });

      ordersListContainer.appendChild(card);
    });
  }

  // ==========================================================================
  // Modal de Gestão do Pedido
  // ==========================================================================

  function openOrderManageModal(order) {
    const rawItems = Array.isArray(order.items) ? order.items : [];
    let editableItems = rawItems.map(i => ({
      ...i,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 1
    }));

    const addr = order.customer_address || {};
    const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(`Olá, ${order.customer_name}! Estamos acompanhando seu pedido *${order.order_number}* na Soléria.`)}`;

    let currentDiscount = Number(order.discount_amount) || 0;
    let currentTotal = Number(order.total_amount) || 0;

    function calculateSubtotal() {
      return editableItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    }

    let currentSubtotal = calculateSubtotal();
    if (!currentTotal || currentTotal <= 0) {
      currentTotal = Math.max(0, currentSubtotal - currentDiscount);
    }

    function buildItemsRows() {
      return editableItems.map((i, idx) => {
        const aroStr = i.size ? `<span class="cart-item-aro-tag" style="margin-left: 0.35rem;">Aro ${i.size}</span>` : '';
        const skuVal = resolveItemSku(i);
        i.sku = skuVal; // Enriquecimento do item para persistência
        const skuStr = `<div style="font-size: 0.75rem; color: var(--text-secondary); font-family: monospace; margin-top: 0.25rem;">SKU: <strong style="color: var(--brand-terracotta); background: #FAF3EA; padding: 2px 7px; border-radius: 3px; border: 1px solid #E8DCCB;">${skuVal}</strong></div>`;
        const lineTotal = i.price * i.quantity;
        return `
          <div class="admin-item-row" data-idx="${idx}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem; gap: 0.75rem;">
            <div style="flex-grow: 1;">
              <strong style="color: var(--text-primary); font-size: 0.9rem;">${i.quantity}x</strong> ${i.name} ${aroStr}
              ${skuStr}
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted);">R$</span>
              <input type="number" step="0.01" min="0" class="admin-item-edit-input item-price-input" data-idx="${idx}" value="${i.price.toFixed(2)}" title="Preço unitário cobrado por esta peça">
            </div>
            <div class="item-line-total" style="font-weight: 700; color: var(--gold-dark); min-width: 80px; text-align: right;">
              ${formatMoney(lineTotal)}
            </div>
          </div>
        `;
      }).join('');
    }

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; padding-right: 3.5rem;">
        <div>
          <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Gestão do Pedido</span>
          <h3 style="font-family: monospace; font-size: 1.4rem; color: var(--brand-terracotta); margin: 0.15rem 0;">
            ${order.order_number}
          </h3>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${formatDate(order.created_at)}</span>
        </div>
        <div>
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-order" style="width: auto; padding: 0.45rem 0.85rem; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            💬 Conversar com Cliente
          </a>
        </div>
      </div>

      <!-- Dados da Cliente & Endereço -->
      <div style="background: #FCFBF9; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.25rem; font-size: 0.85rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block;">Cliente</span>
            <strong>${order.customer_name}</strong>
            <div style="color: var(--text-secondary);">${order.customer_phone}</div>
          </div>
          <div>
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block;">Entrega</span>
            <strong>${order.delivery_type === 'retirada' ? 'Retirada no Local' : 'Entrega em Domicílio'}</strong>
            ${order.delivery_type !== 'retirada' && addr.street ? `
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem;">
                ${addr.street}, ${addr.number || 'S/N'} ${addr.complement ? `(${addr.complement})` : ''} - ${addr.neighborhood || ''}, ${addr.city || ''}
              </div>
            ` : ''}
          </div>
        </div>
        ${order.customer_notes ? `
          <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-medium); font-size: 0.78rem;">
            <strong>Observações da Cliente:</strong> <em>"${order.customer_notes}"</em>
          </div>
        ` : ''}
      </div>

      <!-- Peças Selecionadas & Ajuste de Preço -->
      <div style="margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem;">
          <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Peças & Valores Cobrados</span>
          <span style="font-size: 0.72rem; color: var(--brand-terracotta);">Edite os valores se concedeu desconto no WhatsApp</span>
        </div>
        <div id="modal-items-container">${buildItemsRows()}</div>
      </div>

      <!-- Resumo Financeiro & Desconto Negociado -->
      <div class="admin-order-pricing-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 0.85rem;">
          <span style="color: var(--text-secondary);">Subtotal das Peças:</span>
          <strong id="modal-subtotal-val" style="color: var(--text-primary);">${formatMoney(currentSubtotal)}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; font-size: 0.85rem; flex-wrap: wrap; gap: 0.4rem;">
          <div>
            <span style="color: var(--text-secondary); display: block;">Desconto Concedido:</span>
            <div style="display: flex; gap: 0.25rem; margin-top: 0.2rem;">
              <button type="button" class="admin-price-chip-btn btn-quick-discount" data-pct="5">-5%</button>
              <button type="button" class="admin-price-chip-btn btn-quick-discount" data-pct="10">-10%</button>
              <button type="button" class="admin-price-chip-btn btn-quick-discount" data-pct="15">-15%</button>
              <button type="button" class="admin-price-chip-btn btn-quick-discount" data-pct="0">Zerar</button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">R$</span>
            <input type="number" step="0.01" min="0" id="order-input-discount" class="admin-item-edit-input" style="width: 85px;" value="${currentDiscount.toFixed(2)}">
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.65rem; border-top: 1px solid var(--border-medium); font-size: 0.95rem;">
          <strong style="color: var(--text-primary);">Valor Final a Cobrar:</strong>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--gold-dark);">R$</span>
            <input type="number" step="0.01" min="0" id="order-input-total" class="admin-item-edit-input" style="width: 105px; font-size: 1rem; font-weight: 700; color: var(--gold-dark); border-color: var(--gold-primary);" value="${currentTotal.toFixed(2)}">
          </div>
        </div>

        <div id="modal-discount-tag" style="display: ${currentDiscount > 0 ? 'inline-block' : 'none'}; margin-top: 0.5rem; font-size: 0.72rem; color: #15803D; background: #DCFCE7; padding: 0.2rem 0.6rem; border-radius: var(--radius-xs); font-weight: 600;">
          🏷️ Preço Especial: Desconto de ${formatMoney(currentDiscount)} aplicado
        </div>
      </div>

      <!-- Status do Estoque e Confirmação de Pedido -->
      <div style="margin-bottom: 1.25rem;">
        ${order.stock_deducted ? `
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-sm); padding: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
              <div>
                <strong style="font-size: 0.82rem; color: #166534; text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                  ✓ Estoque Deduzido pelo Sistema
                </strong>
                <span style="font-size: 0.76rem; color: #14532D; display: block; margin-top: 0.15rem;">
                  As peças deste pedido foram deduzidas de forma atômica no banco de dados.
                </span>
              </div>
              ${order.status !== 'cancelado' ? `
              <button type="button" class="btn-secondary-action" id="btn-restore-order-stock" style="font-size: 0.76rem; padding: 0.45rem 0.85rem; color: #B91C1C; border-color: #FCA5A5;">
                ↩ Devolver Peças ao Estoque
              </button>
              ` : ''}
            </div>
          </div>
        ` : (order.stock_restored ? `
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-sm); padding: 1rem;">
            <div>
              <strong style="font-size: 0.82rem; color: #991B1B; text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                ↩ Peças Devolvidas ao Estoque
              </strong>
              <span style="font-size: 0.76rem; color: #7F1D1D; display: block; margin-top: 0.15rem;">
                O pedido foi cancelado e as peças foram repostas no catálogo.
              </span>
            </div>
          </div>
        ` : `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); padding: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
              <div>
                <strong style="font-size: 0.82rem; color: #92400E; text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                  ⚡ Confirmação de Pagamento & Pedido
                </strong>
                <span style="font-size: 0.76rem; color: #78350F; display: block; margin-top: 0.15rem;">
                  Confirme o pagamento para avançar o pedido para o status Confirmado.
                </span>
              </div>
              <button type="button" class="btn-primary" id="btn-confirm-order-stock" style="padding: 0.55rem 1.1rem; font-size: 0.8rem; background: #059669; border-color: #059669;">
                ✓ Confirmar Pagamento & Pedido
              </button>
            </div>
          </div>
        `)}
      </div>

      <!-- Formulário de Atualização de Status & Rastreio -->
      <form id="form-update-order">
        <div class="form-group" style="margin-bottom: 0.85rem;">
          <label class="form-label">Status do Pedido <span class="required">*</span></label>
          <select id="modal-order-status" class="form-select">
            <option value="recebido" ${order.status === 'recebido' ? 'selected' : ''}>Recebido (Aguardando Pagamento)</option>
            <option value="confirmado" ${order.status === 'confirmado' ? 'selected' : ''}>Pagamento Confirmado</option>
            <option value="preparacao" ${order.status === 'preparacao' ? 'selected' : ''}>Em Preparação & Embalagem</option>
            <option value="enviado" ${order.status === 'enviado' ? 'selected' : ''}>Enviado / A Caminho</option>
            <option value="entregue" ${order.status === 'entregue' ? 'selected' : ''}>Entregue & Concluído</option>
            <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
          <span id="cancel-warning-hint" style="display: ${order.status === 'cancelado' ? 'block' : 'none'}; font-size: 0.75rem; color: #B91C1C; margin-top: 0.3rem;">
            ⚠️ Ao salvar como Cancelado, as peças do pedido serão devolvidas ao estoque do catálogo.
          </span>
        </div>

        <div class="form-group" style="margin-bottom: 0.85rem;">
          <label class="form-label">Código de Rastreamento (Correios / Transportadora)</label>
          <input type="text" id="modal-tracking-code" class="form-input" placeholder="Ex: QB123456789BR" value="${order.tracking_code || ''}">
          <span class="form-help-text">Ao preencher, a cliente poderá acompanhar o envio na tela de consulta de pedido.</span>
        </div>

        <div class="form-group" style="margin-bottom: 1.15rem;">
          <label class="form-label">Notas Internas da Equipe</label>
          <textarea id="modal-admin-notes" class="form-textarea" rows="2" placeholder="Ex: Pagamento recebido via PIX em 28/09.">${order.admin_notes || ''}</textarea>
        </div>

        <!-- Etapa 5.4: Notificações no WhatsApp da Cliente -->
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.3rem;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 0.35rem;">
              <span>📲</span> Disparar Notificação no WhatsApp da Cliente
            </div>
            <span style="font-size: 0.72rem; color: #15803d; font-weight: 600;">${order.customer_phone || 'Sem telefone'}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem;">
            <button type="button" class="btn-whatsapp-notify" data-type="pago" style="padding: 0.45rem 0.65rem; font-size: 0.74rem; background: #fff; border: 1px solid #86EFAC; border-radius: 4px; color: #166534; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 0.35rem; font-weight: 500;">
              <span>💚</span> Pagamento Aprovado
            </button>
            <button type="button" class="btn-whatsapp-notify" data-type="enviado" style="padding: 0.45rem 0.65rem; font-size: 0.74rem; background: #fff; border: 1px solid #86EFAC; border-radius: 4px; color: #166534; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 0.35rem; font-weight: 500;">
              <span>📦</span> Envio & Rastreio
            </button>
            <button type="button" class="btn-whatsapp-notify" data-type="retirada" style="padding: 0.45rem 0.65rem; font-size: 0.74rem; background: #fff; border: 1px solid #86EFAC; border-radius: 4px; color: #166534; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 0.35rem; font-weight: 500;">
              <span>✨</span> Pronto p/ Retirada
            </button>
            <button type="button" class="btn-whatsapp-notify" data-type="entregue" style="padding: 0.45rem 0.65rem; font-size: 0.74rem; background: #fff; border: 1px solid #86EFAC; border-radius: 4px; color: #166534; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 0.35rem; font-weight: 500;">
              <span>🎉</span> Pedido Entregue
            </button>
          </div>
          <div style="font-size: 0.7rem; color: #166534; margin-top: 0.4rem; opacity: 0.85;">
            ✦ Ao clicar, abre o WhatsApp com mensagem pré-formatada e aciona o webhook configurado.
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn-secondary-action" id="btn-cancel-manage" style="padding: 0.65rem 1rem;">
            Fechar
          </button>
          <button type="submit" class="btn-primary" id="btn-save-order" style="padding: 0.65rem 1.5rem;">
            Salvar Alterações
          </button>
        </div>
      </form>
    `;

    // Interatividade dos Campos de Preço e Desconto
    const subtotalDisplay = modalContent.querySelector('#modal-subtotal-val');
    const inputDiscount = modalContent.querySelector('#order-input-discount');
    const inputTotal = modalContent.querySelector('#order-input-total');
    const discountTag = modalContent.querySelector('#modal-discount-tag');

    function syncPricingUI() {
      currentSubtotal = calculateSubtotal();
      if (subtotalDisplay) subtotalDisplay.textContent = formatMoney(currentSubtotal);

      if (currentDiscount > 0) {
        if (discountTag) {
          discountTag.style.display = 'inline-block';
          discountTag.textContent = `🏷️ Preço Especial: Desconto de ${formatMoney(currentDiscount)} aplicado`;
        }
      } else {
        if (discountTag) discountTag.style.display = 'none';
      }

      if (inputDiscount) inputDiscount.value = currentDiscount.toFixed(2);
      if (inputTotal) inputTotal.value = currentTotal.toFixed(2);
    }

    // Edição individual de preço de peça
    modalContent.querySelectorAll('.item-price-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.idx);
        const val = parseFloat(inp.value) || 0;
        if (editableItems[idx]) {
          editableItems[idx].price = val;
          const lineElem = modalContent.querySelector(`.admin-item-row[data-idx="${idx}"] .item-line-total`);
          if (lineElem) lineElem.textContent = formatMoney(val * editableItems[idx].quantity);
        }
        currentSubtotal = calculateSubtotal();
        currentTotal = Math.max(0, currentSubtotal - currentDiscount);
        syncPricingUI();
      });
    });

    // Edição do Desconto
    if (inputDiscount) {
      inputDiscount.addEventListener('input', () => {
        currentDiscount = parseFloat(inputDiscount.value) || 0;
        currentTotal = Math.max(0, currentSubtotal - currentDiscount);
        syncPricingUI();
      });
    }

    // Edição do Total Direto (ex: cliente negociou R$ 60,00)
    if (inputTotal) {
      inputTotal.addEventListener('input', () => {
        currentTotal = parseFloat(inputTotal.value) || 0;
        currentDiscount = Math.max(0, currentSubtotal - currentTotal);
        syncPricingUI();
      });
    }

    // Botões de Desconto Rápido (-5%, -10%, -15%, Zerar)
    modalContent.querySelectorAll('.btn-quick-discount').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.dataset.pct) || 0;
        if (pct === 0) {
          currentDiscount = 0;
          currentTotal = currentSubtotal;
        } else {
          currentDiscount = Number((currentSubtotal * (pct / 100)).toFixed(2));
          currentTotal = Math.max(0, currentSubtotal - currentDiscount);
        }
        syncPricingUI();
      });
    });

    // Aviso visual ao mudar status para cancelado
    const statusSelect = modalContent.querySelector('#modal-order-status');
    const cancelHint = modalContent.querySelector('#cancel-warning-hint');
    if (statusSelect && cancelHint) {
      statusSelect.addEventListener('change', () => {
        cancelHint.style.display = statusSelect.value === 'cancelado' ? 'block' : 'none';
      });
    }

    // Botão de Confirmar Pagamento & Pedido
    const btnConfirmStock = modalContent.querySelector('#btn-confirm-order-stock');
    if (btnConfirmStock) {
      btnConfirmStock.addEventListener('click', async () => {
        btnConfirmStock.disabled = true;
        btnConfirmStock.textContent = 'Confirmando...';

        try {
          const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
          const hasDb = client && isSupabaseConfigured();

          // Se Supabase offline/mock e o estoque ainda não foi baixado, deduz via fallback local
          if (!hasDb && !order.stock_deducted) {
            await deductOrderItemsFromStock(editableItems);
          }

          order.stock_deducted = true;
          order.stock_restored = false;
          order.items = editableItems;
          order.subtotal = currentSubtotal;
          order.discount_amount = currentDiscount;
          order.total_amount = currentTotal;
          order.status = 'confirmado';
          order.updated_at = new Date().toISOString();

          if (hasDb) {
            await client.from('orders').update({
              items: order.items,
              subtotal: order.subtotal,
              discount_amount: order.discount_amount,
              total_amount: order.total_amount,
              status: order.status,
              stock_deducted: true,
              updated_at: order.updated_at
            }).eq('order_number', order.order_number);
          }

          updateLocalOrder(order);
          showToast(`Pagamento confirmado! Total de ${formatMoney(order.total_amount)} registrado.`, 'success');
          openOrderManageModal(order);
          renderOrders();
        } catch (err) {
          console.error('Erro ao confirmar pagamento:', err);
          showToast('Erro ao confirmar pagamento: ' + (err.message || err), 'error');
          btnConfirmStock.disabled = false;
          btnConfirmStock.textContent = '✓ Confirmar Pagamento & Pedido';
        }
      });
    }

    // Botão de Restaurar / Devolver Peças ao Estoque
    const btnRestoreStock = modalContent.querySelector('#btn-restore-order-stock');
    if (btnRestoreStock) {
      btnRestoreStock.addEventListener('click', async () => {
        if (!confirm('Deseja devolver as peças deste pedido de volta ao estoque do catálogo e cancelar o pedido?')) return;
        btnRestoreStock.disabled = true;
        btnRestoreStock.textContent = 'Devolvendo...';

        try {
          const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
          const hasDb = client && isSupabaseConfigured();

          if (!hasDb) {
            await restoreOrderItemsToStock(editableItems);
          }

          order.status = 'cancelado';
          order.stock_deducted = false;
          order.stock_restored = true;
          order.updated_at = new Date().toISOString();

          if (hasDb) {
            await client.from('orders').update({
              status: 'cancelado',
              stock_deducted: false,
              stock_restored: true,
              updated_at: order.updated_at
            }).eq('order_number', order.order_number);
          }

          updateLocalOrder(order);
          showToast('Pedido cancelado e peças devolvidas ao estoque!', 'info');
          openOrderManageModal(order);
          renderOrders();
        } catch (err) {
          console.error('Erro ao devolver estoque:', err);
          showToast('Erro ao devolver peças: ' + (err.message || err), 'error');
          btnRestoreStock.disabled = false;
          btnRestoreStock.textContent = '↩ Devolver Peças ao Estoque';
        }
      });
    }

    // Interatividade dos botões de disparo de Notificação no WhatsApp (Etapa 5.4)
    modalContent.querySelectorAll('.btn-whatsapp-notify').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const currentTracking = modalContent.querySelector('#modal-tracking-code')?.value;
        triggerWhatsAppNotification(order, type, currentTracking);
      });
    });

    // Salvar formulário completo
    const form = modalContent.querySelector('#form-update-order');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldStatus = order.status;
      const newStatus = modalContent.querySelector('#modal-order-status').value;
      const newTracking = modalContent.querySelector('#modal-tracking-code').value.trim();
      const newNotes = modalContent.querySelector('#modal-admin-notes').value.trim();

      const btnSave = modalContent.querySelector('#btn-save-order');
      btnSave.disabled = true;
      btnSave.textContent = 'Gravando...';

      try {
        const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
        const hasDb = client && isSupabaseConfigured();

        // Se o status mudou para cancelado, devolve as peças
        // Nota: No Supabase, o trigger trg_order_stock_restore cuida da devolução atômica no banco
        if (newStatus === 'cancelado' && order.status !== 'cancelado' && !order.stock_restored) {
          if (!hasDb) {
            await restoreOrderItemsToStock(editableItems);
          }
          order.stock_deducted = false;
          order.stock_restored = true;
          showToast('Pedido cancelado e peças devolvidas ao estoque do catálogo!', 'info');
        }

        order.status = newStatus;
        order.tracking_code = newTracking;
        order.admin_notes = newNotes;
        order.items = editableItems;
        order.subtotal = currentSubtotal;
        order.discount_amount = currentDiscount;
        order.total_amount = currentTotal;
        order.updated_at = new Date().toISOString();

        if (hasDb) {
          const { error } = await client
            .from('orders')
            .update({
              status: order.status,
              tracking_code: order.tracking_code,
              admin_notes: order.admin_notes,
              items: order.items,
              subtotal: order.subtotal,
              discount_amount: order.discount_amount,
              total_amount: order.total_amount,
              stock_deducted: order.stock_deducted,
              updated_at: order.updated_at
            })
            .eq('order_number', order.order_number);

          if (error) throw error;
        }

        updateLocalOrder(order);

        // Se o status foi alterado, aciona o webhook automático se configurado (Etapa 5.4)
        if (newStatus !== oldStatus) {
          triggerStatusChangeWebhook(order, newStatus, newTracking);
        }

        showToast(`Pedido ${order.order_number} e valores atualizados com sucesso!`, 'success');
        closeOrderModal();
        renderOrders();
      } catch (err) {
        console.error('Erro ao atualizar pedido:', err);
        showToast('Erro ao gravar alterações: ' + (err.message || err), 'error');
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Salvar Alterações';
      }
    });

    const btnCancel = modalContent.querySelector('#btn-cancel-manage');
    if (btnCancel) btnCancel.addEventListener('click', closeOrderModal);

    manageModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeOrderModal() {
    manageModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeOrderModal);
  if (manageModal) {
    manageModal.addEventListener('click', (e) => {
      if (e.target === manageModal) closeOrderModal();
    });
  }

  // ==========================================================================
  // Etapa 5.4: Notificações no WhatsApp & Webhook (Evolution API / Z-API / n8n)
  // ==========================================================================

  function getNotificationText(order, type, trackingOverride = null) {
    const firstName = (order.customer_name || 'Cliente').trim().split(' ')[0];
    const tracking = trackingOverride || order.tracking_code || '';
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
    const trackUrl = `${baseUrl}/rastreio.html?pedido=${order.order_number}`;

    switch (type) {
      case 'pago':
      case 'confirmado':
        return `Olá, ${firstName}! ✨ Confirmamos o pagamento do seu pedido *${order.order_number}* na Soléria Joias. Já iniciamos a separação e preparação das suas semijoias com todo carinho!`;
      case 'enviado':
        return `Olá, ${firstName}! ✨ Seu pedido *${order.order_number}* da Soléria Joias foi despachado! 📦\n\n` +
               (tracking ? `*Código de Rastreamento:* ${tracking}\n` : '') +
               `Você pode acompanhar o envio a qualquer momento pelo link:\n${trackUrl}`;
      case 'retirada':
        return `Olá, ${firstName}! ✨ Seu pedido *${order.order_number}* está pronto para retirada em nosso espaço Soléria Joias em Franca/SP! Aguardamos você com muito carinho.`;
      case 'entregue':
        return `Olá, ${firstName}! ✨ Seu pedido *${order.order_number}* foi entregue! Esperamos que se encante com cada detalhe das suas novas semijoias Soléria. Foi um privilégio atender você! 💫`;
      default:
        return `Olá, ${firstName}! Atualização sobre o seu pedido *${order.order_number}* na Soléria Joias: Status ${type}.`;
    }
  }

  async function dispatchWebhook(payload) {
    const webhookUrl = localStorage.getItem('soleria_whatsapp_webhook_url');
    if (!webhookUrl) return false;

    const token = localStorage.getItem('soleria_whatsapp_webhook_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      headers['apikey'] = token;
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      return true;
    } catch (err) {
      console.warn('Erro ao disparar webhook do WhatsApp:', err);
      return false;
    }
  }

  function triggerWhatsAppNotification(order, type, trackingOverride = null) {
    const cleanDigits = (order.customer_phone || '').replace(/\D/g, '');
    if (!cleanDigits) {
      showToast('Cliente não possui telefone cadastrado.', 'warning');
      return;
    }

    const text = getNotificationText(order, type, trackingOverride);
    const waNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;

    dispatchWebhook({
      event: 'whatsapp_notification_trigger',
      type: type,
      order_number: order.order_number,
      phone: waNumber,
      customer_name: order.customer_name,
      message: text,
      tracking_code: trackingOverride || order.tracking_code,
      created_at: new Date().toISOString()
    });

    window.open(waUrl, '_blank', 'noopener,noreferrer');
    showToast('Abrindo WhatsApp com mensagem formatada!', 'success');
  }

  function triggerStatusChangeWebhook(order, newStatus, newTracking) {
    const autoSend = localStorage.getItem('soleria_whatsapp_webhook_auto') !== 'false';
    if (!autoSend) return;

    const cleanDigits = (order.customer_phone || '').replace(/\D/g, '');
    const waNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
    const text = getNotificationText(order, newStatus, newTracking);

    dispatchWebhook({
      event: 'order_status_updated',
      order_number: order.order_number,
      status: newStatus,
      tracking_code: newTracking,
      phone: waNumber,
      customer_name: order.customer_name,
      message: text,
      total_amount: order.total_amount,
      updated_at: new Date().toISOString()
    });
  }

  // Configuração do Modal de Webhook WhatsApp
  const webhookModal = document.getElementById('webhook-settings-modal');
  const btnOpenWebhook = document.getElementById('btn-webhook-settings');
  const btnCloseWebhook = document.getElementById('btn-close-webhook-modal');
  const btnCancelWebhook = document.getElementById('btn-cancel-webhook');
  const formWebhook = document.getElementById('webhook-settings-form');
  const inputWebhookUrl = document.getElementById('webhook-url-input');
  const inputWebhookToken = document.getElementById('webhook-token-input');
  const checkWebhookAuto = document.getElementById('webhook-auto-send-check');

  if (btnOpenWebhook && webhookModal) {
    btnOpenWebhook.addEventListener('click', () => {
      if (inputWebhookUrl) inputWebhookUrl.value = localStorage.getItem('soleria_whatsapp_webhook_url') || '';
      if (inputWebhookToken) inputWebhookToken.value = localStorage.getItem('soleria_whatsapp_webhook_token') || '';
      if (checkWebhookAuto) checkWebhookAuto.checked = localStorage.getItem('soleria_whatsapp_webhook_auto') !== 'false';
      webhookModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }

  function closeWebhookModal() {
    if (webhookModal) {
      webhookModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (btnCloseWebhook) btnCloseWebhook.addEventListener('click', closeWebhookModal);
  if (btnCancelWebhook) btnCancelWebhook.addEventListener('click', closeWebhookModal);
  if (webhookModal) {
    webhookModal.addEventListener('click', (e) => {
      if (e.target === webhookModal) closeWebhookModal();
    });
  }

  if (formWebhook) {
    formWebhook.addEventListener('submit', (e) => {
      e.preventDefault();
      localStorage.setItem('soleria_whatsapp_webhook_url', (inputWebhookUrl?.value || '').trim());
      localStorage.setItem('soleria_whatsapp_webhook_token', (inputWebhookToken?.value || '').trim());
      localStorage.setItem('soleria_whatsapp_webhook_auto', checkWebhookAuto?.checked ? 'true' : 'false');
      showToast('Configurações de Webhook salvas com sucesso!', 'success');
      closeWebhookModal();
    });
  }

  // ==========================================================================
  // Etapa 5.5: Exportação Financeira (CSV & Impressão/PDF)
  // ==========================================================================

  function exportOrdersToCSV() {
    if (!rawOrders || rawOrders.length === 0) {
      showToast('Nenhum pedido disponível para exportar.', 'warning');
      return;
    }

    const headers = [
      'Numero_Pedido',
      'Data_Criacao',
      'Cliente',
      'CPF',
      'WhatsApp',
      'Email',
      'Tipo_Envio',
      'Cidade_UF',
      'Itens_Qtd',
      'Subtotal_RS',
      'Cupom',
      'Desconto_RS',
      'Total_RS',
      'Status',
      'Rastreio'
    ];

    const rows = rawOrders.map(o => {
      const itemsSummary = Array.isArray(o.items)
        ? o.items.map(i => `${i.quantity}x ${i.name}`).join(' | ')
        : 'Diversos';

      const cityUf = o.customer_address ? `${o.customer_address.city || ''}` : '';

      return [
        `"${o.order_number}"`,
        `"${formatDate(o.created_at)}"`,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        `"${o.customer_cpf || ''}"`,
        `"${o.customer_phone || ''}"`,
        `"${o.customer_email || ''}"`,
        `"${o.delivery_type === 'retirada' ? 'Retirada' : 'Entrega'}"`,
        `"${cityUf.replace(/"/g, '""')}"`,
        `"${itemsSummary.replace(/"/g, '""')}"`,
        (Number(o.subtotal) || 0).toFixed(2),
        `"${o.discount_code || ''}"`,
        (Number(o.discount_amount) || 0).toFixed(2),
        (Number(o.total_amount) || 0).toFixed(2),
        `"${o.status}"`,
        `"${o.tracking_code || ''}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `soleria_pedidos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha de vendas exportada com sucesso!', 'success');
  }

  function printOrdersReport() {
    if (!rawOrders || rawOrders.length === 0) {
      showToast('Nenhum pedido disponível para impressão.', 'warning');
      return;
    }

    const printWin = window.open('', '_blank');
    const rowsHtml = rawOrders.map(o => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd;"><strong>#${o.order_number}</strong></td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd;">${formatDate(o.created_at)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd;">${o.customer_name}<br><small style="color: #666;">${o.customer_phone || ''}</small></td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd;">${o.delivery_type === 'retirada' ? 'Retirada' : 'Entrega'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-size: 11px;"><strong>${o.status}</strong></td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${formatMoney(o.total_amount)}</td>
      </tr>
    `).join('');

    const totalRev = rawOrders.filter(o => o.status !== 'cancelado').reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Executivo de Vendas — Soléria Joias</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #222; padding: 25px; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #c5a96f; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #1a1a1a; letter-spacing: 0.05em; }
          .subtitle { font-size: 12px; color: #666; margin-top: 3px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; padding: 8px; background: #faf8f5; border-bottom: 2px solid #ccc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">SOLÉRIA — RELATÓRIO DE VENDAS</div>
            <div class="subtitle">Emissão em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} &bull; Total de ${rawOrders.length} pedidos</div>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 11px; text-transform: uppercase; color: #888;">Faturamento Ativo</span>
            <div style="font-size: 18px; font-weight: bold; color: #92400e;">${formatMoney(totalRev)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Envio</th>
              <th>Status</th>
              <th style="text-align: right;">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  const btnExportCsv = document.getElementById('btn-export-orders-csv');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportOrdersToCSV);

  const btnPrintReport = document.getElementById('btn-print-orders-report');
  if (btnPrintReport) btnPrintReport.addEventListener('click', printOrdersReport);

  function updateLocalOrder(order) {
    try {
      const local = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
      const idx = local.findIndex(o => o.order_number === order.order_number);
      if (idx !== -1) {
        local[idx] = order;
      } else {
        local.unshift(order);
      }
      localStorage.setItem('soleria_local_orders', JSON.stringify(local));
    } catch (e) {}
  }

  /**
   * Dá baixa automática nas peças do pedido no banco de produtos
   */
  async function deductOrderItemsFromStock(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
    if (!client || !isSupabaseConfigured()) return;

    for (const item of items) {
      if (!item.id) continue;
      const qtyToDeduct = Number(item.quantity) || 1;

      try {
        const { data: prod, error } = await client.from('products').select('id, stock, sizes').eq('id', item.id).single();
        if (error || !prod) continue;

        let newStock = Number(prod.stock) || 0;
        let newSizes = prod.sizes || {};

        if (typeof newSizes === 'string') {
          try { newSizes = JSON.parse(newSizes); } catch (e) { newSizes = {}; }
        }

        if (item.size && newSizes && typeof newSizes === 'object') {
          const curAroQty = Number(newSizes[item.size]) || 0;
          newSizes[item.size] = Math.max(0, curAroQty - qtyToDeduct);
          newStock = Object.values(newSizes).reduce((acc, q) => acc + (Number(q) || 0), 0);
          await client.from('products').update({ sizes: newSizes, stock: newStock }).eq('id', item.id);
        } else {
          newStock = Math.max(0, newStock - qtyToDeduct);
          await client.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      } catch (err) {
        console.warn('Erro ao baixar estoque:', item.id, err);
      }
    }
  }

  /**
   * Restaura peças do pedido de volta ao estoque dos produtos
   */
  async function restoreOrderItemsToStock(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
    if (!client || !isSupabaseConfigured()) return;

    for (const item of items) {
      if (!item.id) continue;
      const qtyToRestore = Number(item.quantity) || 1;

      try {
        const { data: prod, error } = await client.from('products').select('id, stock, sizes').eq('id', item.id).single();
        if (error || !prod) continue;

        let newStock = Number(prod.stock) || 0;
        let newSizes = prod.sizes || {};

        if (typeof newSizes === 'string') {
          try { newSizes = JSON.parse(newSizes); } catch (e) { newSizes = {}; }
        }

        if (item.size && newSizes && typeof newSizes === 'object') {
          const curAroQty = Number(newSizes[item.size]) || 0;
          newSizes[item.size] = curAroQty + qtyToRestore;
          newStock = Object.values(newSizes).reduce((acc, q) => acc + (Number(q) || 0), 0);
          await client.from('products').update({ sizes: newSizes, stock: newStock }).eq('id', item.id);
        } else {
          newStock = newStock + qtyToRestore;
          await client.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      } catch (err) {
        console.warn('Erro ao restaurar estoque:', item.id, err);
      }
    }
  }

  // Listeners de filtro
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderOrders();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      renderOrders();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadOrders();
      showToast('Lista de pedidos atualizada.', 'info');
    });
  }

  // Inicializa carregando os pedidos
  loadOrders();
});

