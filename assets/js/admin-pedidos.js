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
        (order.customer_cpf && (order.customer_cpf.includes(cleanDigits) || order.customer_cpf.includes(q))) ||
        matchPhone ||
        items.some(it => (it.sku && it.sku.toLowerCase().includes(q)) || (it.name && it.name.toLowerCase().includes(q)));

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
        const skuText = (i.sku && i.sku !== 'N/A') ? ` <span style="font-family: monospace; font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">[${i.sku}]</span>` : '';
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
        const skuStr = (i.sku && i.sku !== 'N/A') ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace; margin-top: 0.2rem;">SKU: <strong style="color: var(--brand-terracotta);">${i.sku}</strong></div>` : '';
        const lineTotal = i.price * i.quantity;
        return `
          <div class="admin-item-row" data-idx="${idx}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem; gap: 0.75rem;">
            <div style="flex-grow: 1;">
              <strong>${i.quantity}x</strong> ${i.name} ${aroStr}
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

      <!-- Confirmação Oficial de Baixa no Estoque -->
      <div style="margin-bottom: 1.25rem;">
        ${order.stock_deducted ? `
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-sm); padding: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
              <div>
                <strong style="font-size: 0.82rem; color: #166534; text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                  ✓ Baixa no Estoque Confirmada pelo Admin
                </strong>
                <span style="font-size: 0.76rem; color: #14532D; display: block; margin-top: 0.15rem;">
                  A saída física dos produtos foi oficializada no estoque do catálogo.
                </span>
              </div>
              <button type="button" class="btn-secondary-action" id="btn-restore-order-stock" style="font-size: 0.76rem; padding: 0.45rem 0.85rem; color: #B91C1C; border-color: #FCA5A5;">
                ↩ Devolver Peças ao Estoque
              </button>
            </div>
          </div>
        ` : `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); padding: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
              <div>
                <strong style="font-size: 0.82rem; color: #92400E; text-transform: uppercase; display: flex; align-items: center; gap: 0.35rem;">
                  ⚡ Confirmação de Baixa do Estoque
                </strong>
                <span style="font-size: 0.76rem; color: #78350F; display: block; margin-top: 0.15rem;">
                  Itens reservados. Confirme para oficializar a baixa definitiva do estoque e registrar a venda.
                </span>
              </div>
              <button type="button" class="btn-primary" id="btn-confirm-order-stock" style="padding: 0.55rem 1.1rem; font-size: 0.8rem; background: #059669; border-color: #059669;">
                ✓ Confirmar Baixa do Estoque
              </button>
            </div>
          </div>
        `}
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

        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label">Notas Internas da Equipe</label>
          <textarea id="modal-admin-notes" class="form-textarea" rows="2" placeholder="Ex: Pagamento recebido via PIX em 28/09.">${order.admin_notes || ''}</textarea>
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

    // Botão de Confirmar Baixa do Estoque
    const btnConfirmStock = modalContent.querySelector('#btn-confirm-order-stock');
    if (btnConfirmStock) {
      btnConfirmStock.addEventListener('click', async () => {
        btnConfirmStock.disabled = true;
        btnConfirmStock.textContent = 'Gravando baixa...';

        try {
          await deductOrderItemsFromStock(editableItems);
          order.stock_deducted = true;
          order.stock_restored = false;
          order.items = editableItems;
          order.subtotal = currentSubtotal;
          order.discount_amount = currentDiscount;
          order.total_amount = currentTotal;

          if (order.status === 'recebido') {
            order.status = 'confirmado';
          }
          order.updated_at = new Date().toISOString();

          const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
          if (client && isSupabaseConfigured()) {
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
          showToast(`Baixa do estoque confirmada! Valor de ${formatMoney(order.total_amount)} registrado.`, 'success');
          openOrderManageModal(order);
          renderOrders();
        } catch (err) {
          console.error('Erro ao confirmar baixa de estoque:', err);
          showToast('Erro ao confirmar baixa: ' + (err.message || err), 'error');
          btnConfirmStock.disabled = false;
          btnConfirmStock.textContent = '✓ Confirmar Baixa do Estoque';
        }
      });
    }

    // Botão de Restaurar / Devolver Peças ao Estoque
    const btnRestoreStock = modalContent.querySelector('#btn-restore-order-stock');
    if (btnRestoreStock) {
      btnRestoreStock.addEventListener('click', async () => {
        if (!confirm('Deseja devolver as peças deste pedido de volta ao estoque do catálogo?')) return;
        btnRestoreStock.disabled = true;
        btnRestoreStock.textContent = 'Devolvendo...';

        try {
          await restoreOrderItemsToStock(editableItems);
          order.stock_deducted = false;
          order.stock_restored = true;
          order.updated_at = new Date().toISOString();

          const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
          if (client && isSupabaseConfigured()) {
            await client.from('orders').update({
              stock_deducted: false,
              updated_at: order.updated_at
            }).eq('order_number', order.order_number);
          }

          updateLocalOrder(order);
          showToast('Peças devolvidas ao estoque do catálogo com sucesso!', 'info');
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

    // Salvar formulário completo
    const form = modalContent.querySelector('#form-update-order');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newStatus = modalContent.querySelector('#modal-order-status').value;
      const newTracking = modalContent.querySelector('#modal-tracking-code').value.trim();
      const newNotes = modalContent.querySelector('#modal-admin-notes').value.trim();

      const btnSave = modalContent.querySelector('#btn-save-order');
      btnSave.disabled = true;
      btnSave.textContent = 'Gravando...';

      try {
        // Se o status mudou para cancelado, devolve as peças reservadas/baixadas ao catálogo
        if (newStatus === 'cancelado' && order.status !== 'cancelado' && !order.stock_restored) {
          await restoreOrderItemsToStock(editableItems);
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

        const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
        if (client && isSupabaseConfigured()) {
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
