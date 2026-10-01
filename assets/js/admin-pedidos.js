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

      const matchSearch = !q ||
        (order.order_number && order.order_number.toLowerCase().includes(q)) ||
        (order.customer_name && order.customer_name.toLowerCase().includes(q)) ||
        matchPhone;

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
        return `• ${i.quantity}x ${i.name}${aroText}`;
      }).join('<br>');

      card.innerHTML = `
        <div class="admin-order-header">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="admin-order-number">${order.order_number}</span>
            <span class="order-badge ${stInfo.class}">${stInfo.label}</span>
            ${order.stock_deducted 
              ? `<span style="font-size: 0.7rem; color: #046C4E; background: #DEF7EC; padding: 0.15rem 0.45rem; border-radius: var(--radius-xs); font-weight: 600;">✓ Estoque Baixado</span>`
              : `<span style="font-size: 0.7rem; color: #92400E; background: #FEF3C7; padding: 0.15rem 0.45rem; border-radius: var(--radius-xs); font-weight: 600;">⚠️ Estoque Não Baixado</span>`
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
    const items = Array.isArray(order.items) ? order.items : [];
    const addr = order.customer_address || {};
    const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(`Olá, ${order.customer_name}! Estamos acompanhando seu pedido *${order.order_number}* na Soléria.`)}`;

    let itemsRows = '';
    items.forEach(i => {
      const aroStr = i.size ? `<span class="cart-item-aro-tag" style="margin-left: 0.35rem;">Aro ${i.size}</span>` : '';
      itemsRows += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem;">
          <div>
            <strong>${i.quantity}x</strong> ${i.name} ${aroStr}
          </div>
          <div style="font-weight: 600; color: var(--gold-dark);">${formatMoney(i.price * i.quantity)}</div>
        </div>
      `;
    });

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem;">
        <div>
          <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Gestão do Pedido</span>
          <h3 style="font-family: monospace; font-size: 1.4rem; color: var(--brand-terracotta); margin: 0.15rem 0;">
            ${order.order_number}
          </h3>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${formatDate(order.created_at)}</span>
        </div>
        <div>
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-order" style="width: auto; padding: 0.45rem 0.85rem; font-size: 0.78rem;">
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

      <!-- Lista de Itens -->
      <div style="margin-bottom: 1.25rem;">
        <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Peças Selecionadas</span>
        <div>${itemsRows}</div>
        <div style="text-align: right; margin-top: 0.5rem; font-size: 1rem; font-weight: 700;">
          Total: <span style="color: var(--gold-dark);">${formatMoney(order.total_amount)}</span>
        </div>
      </div>

      <!-- Baixa de Estoque Automática -->
      <div style="background: #FDF9F6; border: 1px solid var(--brand-terracotta-border); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong style="font-size: 0.82rem; color: var(--brand-terracotta); text-transform: uppercase; letter-spacing: 0.05em; display: block;">
              ⚡ Baixa no Estoque do Banco
            </strong>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">
              ${order.stock_deducted ? '✓ O estoque das peças deste pedido já foi baixado no sistema.' : 'Abater automaticamente 1 unidade de cada peça/aro no Supabase.'}
            </span>
          </div>
          <div>
            <button type="button" class="btn-admin-deduct" id="btn-deduct-order-stock" ${order.stock_deducted ? 'disabled' : ''} style="width: auto; padding: 0.5rem 0.9rem; font-size: 0.78rem;">
              <span>${order.stock_deducted ? '✓ Já Baixado' : '⚡ Baixar Estoque Agora'}</span>
            </button>
          </div>
        </div>
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

    // Evento de Baixa no Estoque
    const btnDeduct = modalContent.querySelector('#btn-deduct-order-stock');
    if (btnDeduct) {
      btnDeduct.addEventListener('click', async () => {
        if (order.stock_deducted) return;
        btnDeduct.disabled = true;
        btnDeduct.textContent = 'Processando baixa...';

        try {
          await deductOrderItemsFromStock(order.items);
          order.stock_deducted = true;

          // Atualiza pedido
          if (typeof db !== 'undefined' && db && isSupabaseConfigured()) {
            await db.from('orders').update({ stock_deducted: true }).eq('order_number', order.order_number);
          }

          updateLocalOrder(order);
          showToast('Estoque das peças baixado com sucesso!', 'success');
          openOrderManageModal(order);
          renderOrders();
        } catch (err) {
          console.error('Erro ao baixar estoque do pedido:', err);
          showToast('Erro ao baixar estoque: ' + (err.message || err), 'error');
          btnDeduct.disabled = false;
          btnDeduct.textContent = '⚡ Baixar Estoque Agora';
        }
      });
    }

    // Salvar formulário
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
        order.status = newStatus;
        order.tracking_code = newTracking;
        order.admin_notes = newNotes;
        order.updated_at = new Date().toISOString();

        const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
        if (client && isSupabaseConfigured()) {
          const { error } = await client
            .from('orders')
            .update({
              status: newStatus,
              tracking_code: newTracking,
              admin_notes: newNotes,
              updated_at: order.updated_at
            })
            .eq('order_number', order.order_number);

          if (error) throw error;
        }

        updateLocalOrder(order);
        showToast(`Pedido ${order.order_number} atualizado com sucesso!`, 'success');
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

      // Busca dados atuais do produto
      const { data: prod, error } = await db.from('products').select('id, stock, sizes').eq('id', item.id).single();
      if (error || !prod) continue;

      let newStock = prod.stock || 0;
      let newSizes = prod.sizes || {};

      if (typeof newSizes === 'string') {
        try { newSizes = JSON.parse(newSizes); } catch (e) { newSizes = {}; }
      }

      if (item.size && newSizes && typeof newSizes === 'object') {
        const curAroQty = Number(newSizes[item.size]) || 0;
        newSizes[item.size] = Math.max(0, curAroQty - qtyToDeduct);
        newStock = Object.values(newSizes).reduce((acc, q) => acc + Number(q), 0);
        await db.from('products').update({ sizes: newSizes, stock: newStock }).eq('id', item.id);
      } else {
        newStock = Math.max(0, newStock - qtyToDeduct);
        await db.from('products').update({ stock: newStock }).eq('id', item.id);
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
