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
            ${order.payment_method === 'credit_card'
              ? `<span style="background: #F0FDF4; color: #166534; border: 1px solid #BBF7D0; border-radius: 4px; padding: 2px 7px; font-size: 0.72rem; font-weight: 700;">💳 Cartão PagBank (${order.pagbank_card?.installments || 1}x)</span>`
              : `<span style="background: #FAF5FF; color: #6B21A8; border: 1px solid #E9D5FF; border-radius: 4px; padding: 2px 7px; font-size: 0.72rem; font-weight: 700;">💠 PIX</span>`
            }
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

  // ==========================================================================
  // MÓDULO: NOVO PEDIDO PRESENCIAL / ATENDIMENTO BALCÃO COM PRÉ-CADASTRO CPF
  // ==========================================================================

  function cleanCPF(cpf) {
    return (cpf || '').toString().replace(/\D/g, '');
  }

  function formatCPFInput(raw) {
    let v = cleanCPF(raw).slice(0, 11);
    if (v.length > 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
    if (v.length > 6) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
    if (v.length > 3) return `${v.slice(0, 3)}.${v.slice(3)}`;
    return v;
  }

  function formatPhoneInput(raw) {
    let v = (raw || '').toString().replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    if (v.length > 2) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length > 0) return `(${v}`;
    return '';
  }

  function isValidCPFDigits(cpf) {
    const digits = cleanCPF(cpf);
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits.charAt(i), 10) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits.charAt(i), 10) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(10), 10)) return false;

    return true;
  }

  async function hashPasswordLocal(plainPassword) {
    if (!plainPassword) return '';
    try {
      const msgBuffer = new TextEncoder().encode(`soleria_salt_2026_${plainPassword}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let hash = 0;
      const str = `soleria_salt_2026_${plainPassword}`;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return 'fb_' + Math.abs(hash).toString(16);
    }
  }

  // Estado do Modal de Pedido Manual
  let manualProductsList = [];
  let manualSelectedItems = [];

  async function loadProductsForManualOrder() {
    const productSelect = document.getElementById('manual-product-select');
    if (!productSelect) return;

    productSelect.innerHTML = '<option value="">Carregando produtos...</option>';

    let products = [];
    const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);

    if (client && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.from('products').select('*').order('name');
        if (!error && Array.isArray(data)) {
          products = data;
        }
      } catch (e) {
        console.warn('Erro ao carregar produtos do Supabase:', e);
      }
    }

    if (products.length === 0) {
      try {
        products = JSON.parse(localStorage.getItem('soleria_local_products') || '[]');
      } catch (e) {}
    }

    manualProductsList = products;

    if (products.length === 0) {
      productSelect.innerHTML = '<option value="">Nenhum produto cadastrado no estoque</option>';
      return;
    }

    let opts = '<option value="">-- Selecione uma peça do estoque --</option>';
    products.forEach(p => {
      const stockNum = Number(p.stock) || 0;
      const priceStr = formatMoney(p.price);
      const skuStr = p.sku ? `[${p.sku}] ` : '';
      const stockBadge = stockNum > 0 ? `(Estoque: ${stockNum})` : '(Sem estoque)';
      opts += `<option value="${p.id}" ${stockNum <= 0 ? 'data-out="1"' : ''}>${skuStr}${p.name} — ${priceStr} ${stockBadge}</option>`;
    });

    productSelect.innerHTML = opts;
  }

  function setupManualOrderModal() {
    const btnOpen = document.getElementById('btn-open-manual-order');
    const btnToolbarOpen = document.getElementById('btn-toolbar-manual-order');
    const modal = document.getElementById('manual-order-modal');
    const btnClose = document.getElementById('btn-close-manual-order-modal');
    const btnCancel = document.getElementById('btn-cancel-manual-order');
    const form = document.getElementById('form-manual-order');

    const cpfInput = document.getElementById('manual-order-cpf');
    const nameInput = document.getElementById('manual-order-name');
    const phoneInput = document.getElementById('manual-order-phone');
    const emailInput = document.getElementById('manual-order-email');
    const custBadge = document.getElementById('manual-cust-status-badge');
    const cpfHint = document.getElementById('manual-cpf-hint');

    const productSelect = document.getElementById('manual-product-select');
    const sizeSelect = document.getElementById('manual-size-select');
    const qtyInput = document.getElementById('manual-item-qty');
    const priceInput = document.getElementById('manual-item-price');
    const btnAddItem = document.getElementById('btn-manual-add-item');
    const itemsTbody = document.getElementById('manual-items-tbody');

    const deliverySelect = document.getElementById('manual-order-delivery');
    const addrGroup = document.getElementById('manual-delivery-address-group');
    const discountInput = document.getElementById('manual-order-discount');
    const subtotalDisplay = document.getElementById('manual-subtotal-display');
    const totalDisplay = document.getElementById('manual-total-display');
    const deductStockCheck = document.getElementById('manual-order-deduct-stock');

    const successModal = document.getElementById('manual-order-success-modal');
    const btnCloseSuccess = document.getElementById('btn-close-manual-success-modal');
    const btnCloseSuccessBottom = document.getElementById('btn-close-manual-success');

    if (!modal) return;

    function openModal() {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      loadProductsForManualOrder();
      resetForm();
    }

    function closeModal() {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    function resetForm() {
      if (form) form.reset();
      manualSelectedItems = [];
      renderManualItemsTable();
      if (custBadge) custBadge.style.display = 'none';
      if (sizeSelect) {
        sizeSelect.innerHTML = '<option value="">Padrão / Único</option>';
        sizeSelect.disabled = true;
      }
      if (addrGroup) addrGroup.style.display = 'none';
      recalculateTotals();
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnToolbarOpen) btnToolbarOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    if (btnCloseSuccess) btnCloseSuccess.addEventListener('click', () => {
      if (successModal) successModal.classList.remove('active');
      document.body.style.overflow = '';
    });
    if (btnCloseSuccessBottom) btnCloseSuccessBottom.addEventListener('click', () => {
      if (successModal) successModal.classList.remove('active');
      document.body.style.overflow = '';
    });

    // Formatação de CPF e Live Lookup
    if (cpfInput) {
      cpfInput.addEventListener('input', (e) => {
        e.target.value = formatCPFInput(e.target.value);
        const clean = cleanCPF(e.target.value);
        if (clean.length === 11) {
          lookupCustomerByCPF(clean);
        } else {
          if (custBadge) custBadge.style.display = 'none';
        }
      });

      cpfInput.addEventListener('blur', () => {
        const clean = cleanCPF(cpfInput.value);
        if (clean.length === 11) {
          lookupCustomerByCPF(clean);
        }
      });
    }

    // Formatação de WhatsApp
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = formatPhoneInput(e.target.value);
      });
    }

    async function lookupCustomerByCPF(cleanNum) {
      if (!cleanNum || cleanNum.length !== 11) return;

      let foundCustomer = null;
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);

      // 1. Busca no Supabase
      if (client && isSupabaseConfigured()) {
        try {
          const { data, error } = await client.from('customers').select('*').eq('cpf', cleanNum).maybeSingle();
          if (!error && data) {
            foundCustomer = data;
          }
        } catch (e) {}
      }

      // 2. Busca no histórico de pedidos
      if (!foundCustomer && Array.isArray(rawOrders)) {
        const previousOrder = rawOrders.find(o => cleanCPF(o.customer_cpf) === cleanNum);
        if (previousOrder) {
          foundCustomer = {
            name: previousOrder.customer_name,
            phone: previousOrder.customer_phone,
            email: previousOrder.customer_email,
            is_from_order: true
          };
        }
      }

      // 3. Busca no LocalStorage
      if (!foundCustomer) {
        try {
          const localCusts = JSON.parse(localStorage.getItem('soleria_local_customers') || localStorage.getItem('soleria_customers') || '[]');
          foundCustomer = localCusts.find(c => cleanCPF(c.cpf) === cleanNum);
        } catch (e) {}
      }

      if (foundCustomer) {
        if (!nameInput.value || nameInput.value.trim() === '') {
          nameInput.value = foundCustomer.name || '';
        }
        if (!phoneInput.value || phoneInput.value.trim() === '') {
          phoneInput.value = formatPhoneInput(foundCustomer.phone || '');
        }
        if (emailInput && (!emailInput.value || emailInput.value.trim() === '')) {
          emailInput.value = foundCustomer.email || '';
        }

        if (custBadge) {
          custBadge.textContent = '✓ Cliente já identificada no sistema';
          custBadge.style.background = '#DCFCE7';
          custBadge.style.color = '#15803D';
          custBadge.style.border = '1px solid #BBF7D0';
          custBadge.style.display = 'inline-block';
        }
        if (cpfHint) {
          cpfHint.innerHTML = `Cliente localizada: <strong>${foundCustomer.name}</strong>. Os dados foram preenchidos automaticamente.`;
        }
      } else {
        if (custBadge) {
          custBadge.textContent = '✨ Novo pré-cadastro será criado';
          custBadge.style.background = '#FEF3C7';
          custBadge.style.color = '#92400E';
          custBadge.style.border = '1px solid #FDE68A';
          custBadge.style.display = 'inline-block';
        }
        if (cpfHint) {
          cpfHint.textContent = 'Ao salvar, um pré-cadastro com este CPF será gerado e poderá ser ativado na Área da Cliente.';
        }
      }
    }

    // Seleção de Produto
    if (productSelect) {
      productSelect.addEventListener('change', () => {
        const prodId = productSelect.value;
        const prod = manualProductsList.find(p => String(p.id) === String(prodId));

        if (!prod) {
          priceInput.value = '';
          sizeSelect.innerHTML = '<option value="">Padrão / Único</option>';
          sizeSelect.disabled = true;
          return;
        }

        priceInput.value = (Number(prod.price) || 0).toFixed(2);

        // Grade de tamanhos / aros
        let sizesObj = prod.sizes || {};
        if (typeof sizesObj === 'string') {
          try { sizesObj = JSON.parse(sizesObj); } catch (e) { sizesObj = {}; }
        }

        const ringAros = Object.keys(sizesObj).filter(k => sizesObj[k] !== undefined && sizesObj[k] !== null);

        if (ringAros.length > 0) {
          let sizeOpts = '<option value="">Selecione o Aro</option>';
          ringAros.forEach(aro => {
            const stockAro = Number(sizesObj[aro]) || 0;
            sizeOpts += `<option value="${aro}" ${stockAro <= 0 ? 'data-out="1"' : ''}>Aro ${aro} (${stockAro} disp.)</option>`;
          });
          sizeSelect.innerHTML = sizeOpts;
          sizeSelect.disabled = false;
        } else {
          sizeSelect.innerHTML = '<option value="">Padrão / Peça Única</option>';
          sizeSelect.disabled = true;
        }
      });
    }

    // Adicionar Item à Lista
    if (btnAddItem) {
      btnAddItem.addEventListener('click', () => {
        const prodId = productSelect.value;
        if (!prodId) {
          showToast('Selecione uma peça do catálogo.', 'warning');
          productSelect.focus();
          return;
        }

        const prod = manualProductsList.find(p => String(p.id) === String(prodId));
        if (!prod) return;

        const qty = parseInt(qtyInput.value, 10);
        if (isNaN(qty) || qty <= 0) {
          showToast('Informe uma quantidade válida.', 'warning');
          qtyInput.focus();
          return;
        }

        const price = parseFloat(priceInput.value);
        if (isNaN(price) || price < 0) {
          showToast('Informe um valor unitário válido.', 'warning');
          priceInput.focus();
          return;
        }

        let selectedSize = null;
        if (!sizeSelect.disabled && sizeSelect.value) {
          selectedSize = sizeSelect.value;
        }

        // Validação de aro obrigatório se houver grade
        if (!sizeSelect.disabled && !selectedSize) {
          showToast('Por favor, selecione o aro desejado.', 'warning');
          sizeSelect.focus();
          return;
        }

        // Pega imagem
        let imgUrl = 'assets/images/logo-simbolo.png';
        if (Array.isArray(prod.images) && prod.images.length > 0) {
          imgUrl = prod.images[0];
        } else if (typeof prod.images === 'string') {
          try {
            const pImgs = JSON.parse(prod.images);
            if (Array.isArray(pImgs) && pImgs[0]) imgUrl = pImgs[0];
          } catch (e) {
            imgUrl = prod.images;
          }
        }

        // Adiciona ou acumula
        const existingIdx = manualSelectedItems.findIndex(it => it.id === prod.id && it.size === selectedSize);
        if (existingIdx >= 0) {
          manualSelectedItems[existingIdx].quantity += qty;
          manualSelectedItems[existingIdx].price = price;
        } else {
          manualSelectedItems.push({
            id: prod.id,
            sku: prod.sku || 'N/A',
            name: prod.name,
            size: selectedSize,
            quantity: qty,
            price: price,
            image: imgUrl
          });
        }

        renderManualItemsTable();
        recalculateTotals();

        // Reseta campo de produto para próxima peça
        productSelect.value = '';
        sizeSelect.innerHTML = '<option value="">Padrão / Único</option>';
        sizeSelect.disabled = true;
        qtyInput.value = '1';
        priceInput.value = '';
        productSelect.focus();
      });
    }

    function renderManualItemsTable() {
      if (!itemsTbody) return;

      if (manualSelectedItems.length === 0) {
        itemsTbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.8rem;">
              Nenhuma peça adicionada ainda. Selecione um produto acima e clique em "+ Adicionar".
            </td>
          </tr>
        `;
        return;
      }

      let rows = '';
      manualSelectedItems.forEach((it, idx) => {
        const sub = it.quantity * it.price;
        const aroTag = it.size ? `<span style="background: #FAF5F0; border: 1px solid var(--gold-primary); color: var(--gold-dark); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.72rem; font-weight: 700; margin-left: 0.3rem;">Aro ${it.size}</span>` : '';
        const skuStr = it.sku && it.sku !== 'N/A' ? `<span style="font-family: monospace; font-size: 0.72rem; color: var(--text-muted); display: block;">SKU: ${it.sku}</span>` : '';

        rows += `
          <tr style="border-bottom: 1px solid var(--border-light);">
            <td style="padding: 0.65rem 0.85rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <img src="${it.image}" alt="${it.name}" style="width: 34px; height: 34px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border-light);" onerror="this.src='assets/images/logo-simbolo.png'">
                <div>
                  <strong style="color: var(--text-primary); font-size: 0.84rem;">${it.name}</strong> ${aroTag}
                  ${skuStr}
                </div>
              </div>
            </td>
            <td style="padding: 0.65rem 0.85rem; text-align: center; font-weight: 600;">
              ${it.quantity} un
            </td>
            <td style="padding: 0.65rem 0.85rem; text-align: right; color: var(--text-secondary);">
              ${formatMoney(it.price)}
            </td>
            <td style="padding: 0.65rem 0.85rem; text-align: right; font-weight: 700; color: var(--brand-terracotta);">
              ${formatMoney(sub)}
            </td>
            <td style="padding: 0.65rem 0.85rem; text-align: center;">
              <button type="button" class="btn-remove-manual-item" data-idx="${idx}" style="background: none; border: none; color: #DC2626; cursor: pointer; padding: 0.25rem; font-size: 1rem;" title="Remover Peça">
                🗑️
              </button>
            </td>
          </tr>
        `;
      });

      itemsTbody.innerHTML = rows;

      // Eventos de exclusão
      itemsTbody.querySelectorAll('.btn-remove-manual-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          manualSelectedItems.splice(idx, 1);
          renderManualItemsTable();
          recalculateTotals();
        });
      });
    }

    function recalculateTotals() {
      const subtotal = manualSelectedItems.reduce((acc, it) => acc + (it.quantity * it.price), 0);
      const discount = parseFloat(discountInput?.value) || 0;
      const total = Math.max(0, subtotal - discount);

      if (subtotalDisplay) subtotalDisplay.textContent = formatMoney(subtotal);
      if (totalDisplay) totalDisplay.textContent = formatMoney(total);
    }

    if (discountInput) discountInput.addEventListener('input', recalculateTotals);

    if (deliverySelect) {
      deliverySelect.addEventListener('change', () => {
        if (deliverySelect.value === 'entrega') {
          if (addrGroup) addrGroup.style.display = 'block';
        } else {
          if (addrGroup) addrGroup.style.display = 'none';
        }
      });
    }

    // Auto-preenchimento de CEP na entrega do pedido presencial
    const manualCepInput = document.getElementById('manual-addr-cep');
    if (manualCepInput) {
      manualCepInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 8);
        if (v.length > 5) {
          e.target.value = `${v.slice(0, 5)}-${v.slice(5)}`;
        } else {
          e.target.value = v;
        }
        if (v.length === 8) {
          buscarCepManual(v);
        }
      });
      manualCepInput.addEventListener('blur', () => {
        const clean = manualCepInput.value.replace(/\D/g, '');
        if (clean.length === 8) {
          buscarCepManual(clean);
        }
      });
    }

    async function buscarCepManual(cleanCep) {
      try {
        let street = '';
        let city = '';
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const json = await res.json();
        if (!json.erro) {
          street = json.logradouro ? `${json.logradouro}, ` : '';
          if (json.bairro) street += `${json.bairro}`;
          city = `${json.localidade} - ${json.uf}`;
        } else {
          const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
          if (res2.ok) {
            const j2 = await res2.json();
            street = j2.street ? `${j2.street}, ` : '';
            if (j2.neighborhood) street += `${j2.neighborhood}`;
            city = `${j2.city} - ${j2.state}`;
          }
        }
        if (city) {
          const streetEl = document.getElementById('manual-addr-street');
          const cityEl = document.getElementById('manual-addr-city');
          if (streetEl && street && (!streetEl.value || streetEl.value.trim() === '')) streetEl.value = street;
          if (cityEl && city) cityEl.value = city;
          showToast('Endereço preenchido via CEP!', 'info', 2500);
        }
      } catch (e) {}
    }

    // Submit do Pedido Presencial
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const cpfRaw = cpfInput.value;
        const cleanCpf = cleanCPF(cpfRaw);
        if (!isValidCPFDigits(cleanCpf)) {
          showToast('Informe um CPF válido com 11 dígitos para vincular a cliente.', 'error');
          cpfInput.focus();
          return;
        }

        const name = nameInput.value.trim();
        if (name.length < 3) {
          showToast('Informe o nome completo da cliente.', 'error');
          nameInput.focus();
          return;
        }

        const phone = phoneInput.value.trim();
        if (cleanCPF(phone).length < 10) {
          showToast('Informe um WhatsApp/telefone válido com DDD.', 'error');
          phoneInput.focus();
          return;
        }

        if (manualSelectedItems.length === 0) {
          showToast('Adicione pelo menos uma peça à venda.', 'error');
          return;
        }

        const btnSubmit = document.getElementById('btn-submit-manual-order');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Salvando pedido e pré-cadastro...';

        try {
          const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
          const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
          const deliveryType = deliverySelect.value;
          const status = document.getElementById('manual-order-status').value;
          const paymentMethod = document.getElementById('manual-order-payment').value;
          const notes = document.getElementById('manual-order-notes').value.trim();
          const deductStock = deductStockCheck ? deductStockCheck.checked : true;

          const subtotal = manualSelectedItems.reduce((acc, it) => acc + (it.quantity * it.price), 0);
          const discount = parseFloat(discountInput?.value) || 0;
          const total = Math.max(0, subtotal - discount);

          let addressObj = { delivery_type: deliveryType };
          if (deliveryType === 'entrega') {
            addressObj.street = document.getElementById('manual-addr-street')?.value.trim() || '';
            addressObj.city = document.getElementById('manual-addr-city')?.value.trim() || '';
            addressObj.cep = document.getElementById('manual-addr-cep')?.value.trim() || '';
          } else {
            addressObj.notes = 'Retirada presencial / Balcão';
          }

          // 1. Número do pedido
          const orderNumber = `SOL-${Math.floor(10000 + Math.random() * 90000)}`;

          // 2. Pré-Cadastro da Cliente (Senha padrão: 4 primeiros dígitos do CPF)
          const defaultPassword = cleanCpf.slice(0, 4) || '1234';
          const passHash = await hashPasswordLocal(defaultPassword);

          if (client && isSupabaseConfigured()) {
            try {
              // Verifica se já existe cliente
              const { data: existingCust } = await client.from('customers').select('id, email, phone').eq('cpf', cleanCpf).maybeSingle();

              if (existingCust) {
                await client.from('customers').update({
                  name: name,
                  phone: phone,
                  email: email || existingCust.email || null,
                  updated_at: new Date().toISOString()
                }).eq('id', existingCust.id);
              } else {
                await client.from('customers').insert({
                  cpf: cleanCpf,
                  name: name,
                  phone: phone,
                  email: email || null,
                  password_hash: passHash,
                  address: addressObj,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              }
            } catch (custErr) {
              console.warn('Erro ao atualizar customers no Supabase:', custErr);
            }
          }

          // Sincroniza também no LocalStorage
          try {
            const localCusts = JSON.parse(localStorage.getItem('soleria_local_customers') || localStorage.getItem('soleria_customers') || '[]');
            const cIdx = localCusts.findIndex(c => cleanCPF(c.cpf) === cleanCpf);
            if (cIdx >= 0) {
              localCusts[cIdx] = { ...localCusts[cIdx], name, phone, email: email || localCusts[cIdx].email, updated_at: new Date().toISOString() };
            } else {
              localCusts.push({
                id: 'cust_' + Math.random().toString(36).slice(2, 9),
                cpf: cleanCpf,
                name,
                phone,
                email: email || '',
                password_hash: passHash,
                address: addressObj,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
            localStorage.setItem('soleria_local_customers', JSON.stringify(localCusts));
            localStorage.setItem('soleria_customers', JSON.stringify(localCusts));
          } catch (e) {}

          // 3. Criação do Pedido
          const orderRecord = {
            order_number: orderNumber,
            customer_name: name,
            customer_cpf: cleanCpf,
            customer_phone: phone,
            customer_email: email || null,
            delivery_type: deliveryType,
            customer_address: addressObj,
            items: manualSelectedItems,
            subtotal: subtotal,
            discount_amount: discount,
            total_amount: total,
            status: status,
            payment_method: paymentMethod,
            customer_notes: 'Atendimento Presencial / Balcão',
            admin_notes: notes || 'Pedido presencial gerado diretamente no balcão.',
            stock_deducted: deductStock,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          if (client && isSupabaseConfigured()) {
            const { error: ordErr } = await client.from('orders').insert([orderRecord]);
            if (ordErr) {
              console.warn('Erro ao salvar pedido no Supabase:', ordErr);
            }
          }

          // Salva no LocalStorage
          try {
            const localOrds = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
            localOrds.unshift(orderRecord);
            localStorage.setItem('soleria_local_orders', JSON.stringify(localOrds));

            const localAlt = JSON.parse(localStorage.getItem('soleria_orders') || '[]');
            localAlt.unshift(orderRecord);
            localStorage.setItem('soleria_orders', JSON.stringify(localAlt));
          } catch (e) {}

          // 4. Baixa no Estoque se selecionado
          if (deductStock) {
            await deductOrderItemsFromStock(manualSelectedItems);
          }

          // Atualiza dados na tela sem refresh
          rawOrders.unshift(orderRecord);
          renderOrders();
          closeModal();

          // Abre modal de sucesso com link de WhatsApp
          const cleanPhoneDigits = phone.replace(/\D/g, '');
          const waPhone = cleanPhoneDigits.startsWith('55') ? cleanPhoneDigits : `55${cleanPhoneDigits}`;

          const paymentLabels = {
            pix: 'PIX (À Vista)',
            cartao_credito: 'Cartão de Crédito',
            cartao_debito: 'Cartão de Débito',
            dinheiro: 'Dinheiro em Espécie',
            transferencia: 'Transferência Bancária',
            a_combinar: 'A Combinar'
          };

          const itemsText = manualSelectedItems.map(it => `• ${it.quantity}x ${it.name}${it.size ? ` (Aro ${it.size})` : ''} - ${formatMoney(it.price * it.quantity)}`).join('\n');

          const waMsg = `Olá, ${name.split(' ')[0]}! ✨
Aqui é da *Soléria Joias*.
Confirmamos o registro do seu pedido *#${orderNumber}* realizado presencialmente em nosso atendimento.

🛍️ *Peças:*
${itemsText}

💰 *Valor Total:* ${formatMoney(total)}
💳 *Pagamento:* ${paymentLabels[paymentMethod] || paymentMethod}
📦 *Entrega:* ${deliveryType === 'retirada' ? 'Retirada Presencial no Balcão' : 'Entrega em Domicílio'}

💡 *Acesso à sua Área da Cliente:*
Seus pedidos já estão vinculados ao seu CPF (*${formatCPFInput(cleanCpf)}*). Para acompanhar suas peças a qualquer momento, acesse:
https://soleria.carlamota.com.br/minha-conta

Agradecemos imensamente a sua preferência e confiança! 💎`;

          const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;

          document.getElementById('success-manual-order-number').textContent = `#${orderNumber}`;
          document.getElementById('success-manual-customer-name').textContent = name;
          document.getElementById('success-manual-customer-cpf').textContent = formatCPFInput(cleanCpf);
          document.getElementById('success-manual-order-total').textContent = formatMoney(total);
          document.getElementById('btn-manual-whatsapp-receipt').href = waLink;

          if (successModal) {
            successModal.classList.add('active');
            document.body.style.overflow = 'hidden';
          }

          showToast(`Pedido presencial #${orderNumber} gerado com sucesso!`, 'success', 5000);

        } catch (err) {
          console.error('Erro ao gerar pedido presencial:', err);
          showToast('Erro ao criar pedido: ' + err.message, 'error');
        } finally {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '✨ Salvar e Gerar Pedido Presencial';
        }
      });
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

  // Inicializa módulo de pedido presencial e carrega pedidos
  setupManualOrderModal();
  loadOrders();
});

