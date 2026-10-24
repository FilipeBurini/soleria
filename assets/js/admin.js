/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Painel Administrativo: Autenticação, métricas e tabela de estoque financeira
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Aguarda carregamento das credenciais do tenant
  if (window.TENANT_PROMISE) {
    try { await window.TENANT_PROMISE; } catch (e) {}
  }

  // Elementos de Autenticação
  const authSection = document.getElementById('auth-section');
  const adminApp = document.getElementById('admin-app');
  const loginForm = document.getElementById('login-form');
  const loginEmailInput = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  const loginSubmitBtn = document.getElementById('btn-login-submit');
  const adminUserEmail = document.getElementById('admin-user-email');
  const btnLogout = document.getElementById('btn-logout');

  // Elementos da Tabela e Métricas
  const kpiCapitalInvestido = document.getElementById('kpi-capital-investido');
  const kpiLucroProjetado = document.getElementById('kpi-lucro-projetado');
  const kpiTotalItens = document.getElementById('kpi-total-itens');
  const kpiSkusCount = document.getElementById('kpi-skus-count');
  const financialsTableBody = document.getElementById('financials-tbody');
  const tableSpinner = document.getElementById('table-loading-spinner');
  const tableEmptyMsg = document.getElementById('table-empty-msg');
  const searchInput = document.getElementById('admin-search-input');
  const statusFilter = document.getElementById('admin-status-filter');
  const btnRefresh = document.getElementById('btn-refresh-table');
  const btnViewVisual = document.getElementById('btn-view-visual');
  const btnViewTable = document.getElementById('btn-view-table');
  const adminVisualGrid = document.getElementById('admin-visual-grid');
  const tableResponsiveContainer = document.getElementById('table-responsive-container');

  // Elementos do Dashboard 360
  const viewDashboard360 = document.getElementById('view-dashboard-360');
  const viewEstoqueInventory = document.getElementById('view-estoque-inventory');
  const btnTabDashboard = document.getElementById('btn-tab-dashboard');
  const btnTabInventory = document.getElementById('btn-tab-inventory');
  const navItemDashboard = document.getElementById('nav-item-dashboard');
  const navItemEstoque = document.getElementById('nav-item-estoque');
  const btnGotoInventoryTab = document.getElementById('btn-goto-inventory-tab');
  const btnRefreshDashboard = document.getElementById('btn-refresh-dashboard');

  const dashKpiFaturamento = document.getElementById('dash-kpi-faturamento');
  const dashKpiFaturamentoSub = document.getElementById('dash-kpi-faturamento-sub');
  const dashKpiVendasMes = document.getElementById('dash-kpi-vendas-mes');
  const dashKpiVendasMesCount = document.getElementById('dash-kpi-vendas-mes-count');
  const dashKpiTicketMedio = document.getElementById('dash-kpi-ticket-medio');
  const dashKpiCapitalEstoque = document.getElementById('dash-kpi-capital-estoque');
  const dashKpiPecasCount = document.getElementById('dash-kpi-pecas-count');
  const dashKpiClientesTotal = document.getElementById('dash-kpi-clientes-total');
  const dashKpiClientesSub = document.getElementById('dash-kpi-clientes-sub');

  const dashCountRecebido = document.getElementById('dash-count-recebido');
  const dashValRecebido = document.getElementById('dash-val-recebido');
  const dashCountPrep = document.getElementById('dash-count-prep');
  const dashValPrep = document.getElementById('dash-val-prep');
  const dashCountEnvio = document.getElementById('dash-count-envio');
  const dashValEnvio = document.getElementById('dash-val-envio');
  const dashCountEntregue = document.getElementById('dash-count-entregue');
  const dashValEntregue = document.getElementById('dash-val-entregue');

  const dashRecentOrdersList = document.getElementById('dash-recent-orders-list');
  const dashAlertEsgotados = document.getElementById('dash-alert-esgotados');
  const dashAlertBaixo = document.getElementById('dash-alert-baixo');
  const dashStockAlertsList = document.getElementById('dash-stock-alerts-list');
  const dashCrmConversao = document.getElementById('dash-crm-conversao');
  const dashCrmLtv = document.getElementById('dash-crm-ltv');
  const dashTopClientsList = document.getElementById('dash-top-clients-list');

  // Notificação de Baixa Parcial / Saldos a Receber
  const dashPartialNotification = document.getElementById('dash-partial-notification');
  const dashPartialBadgeCount = document.getElementById('dash-partial-badge-count');
  const dashPartialTotalDue = document.getElementById('dash-partial-total-due');
  const dashPartialOrdersList = document.getElementById('dash-partial-orders-list');

  let rawFinancialsData = [];
  let rawOrdersData = [];
  let rawCustomersData = [];

  /**
   * Helper para cálculo de pagamento, entrada e saldo devedor
   */
  function getOrderPaymentInfo(order) {
    if (!order) return { total: 0, paid: 0, due: 0, isPartial: false, isPaid: false, isPending: true };
    const total = Number(order.total_amount) || 0;
    let paid = null;

    if (order.amount_paid !== undefined && order.amount_paid !== null && !isNaN(Number(order.amount_paid))) {
      paid = Number(order.amount_paid);
    } else if (order.admin_notes && typeof order.admin_notes === 'string') {
      const match = order.admin_notes.match(/\[PAGAMENTO_PARCIAL:\s*pago=([\d.]+),\s*restante=([\d.]+)\]/i);
      if (match) {
        paid = parseFloat(match[1]);
      }
    }

    if (paid === null) {
      const st = (order.status || '').toLowerCase();
      const paySt = (order.payment_status || '').toLowerCase();
      if (paySt === 'pago' || paySt === 'quitado' || ['confirmado', 'preparacao', 'enviado', 'entregue'].includes(st)) {
        paid = total;
      } else {
        paid = 0;
      }
    }

    paid = Math.max(0, paid);
    const due = Math.max(0, total - paid);
    const isPartial = paid > 0 && due > 0.01;
    const isPaid = paid >= (total - 0.01) && total > 0;
    const isPending = paid <= 0;

    return { total, paid, due, isPartial, isPaid, isPending };
  }

  /**
   * Helper rigoroso para identificar se o pedido foi cancelado
   */
  function isOrderCancelled(order) {
    if (!order) return false;
    const st = (order.status || '').toLowerCase().trim();
    const paySt = (order.payment_status || '').toLowerCase().trim();
    const notes = (order.admin_notes || '').toLowerCase();

    return st === 'cancelado' ||
           st === 'cancelada' ||
           st === 'canceled' ||
           st.includes('cancel') ||
           paySt === 'cancelado' ||
           paySt === 'canceled' ||
           order.stock_restored === true ||
           notes.includes('[cancelado]');
  }

  // ==========================================================================
  // Fluxo de Autenticação
  // ==========================================================================

  async function checkAuthAndInit() {
    try {
      if (!isSupabaseConfigured()) {
        authSection.style.display = 'flex';
        adminApp.style.display = 'none';
        return;
      }

      const user = await getCurrentUser();
      if (user) {
        // Usuário autenticado
        authSection.style.display = 'none';
        adminApp.style.display = 'block';
        adminUserEmail.textContent = user.email || 'Operador Autenticado';
        loadAllData();
      } else {
        // Não autenticado: mostra formulário de login
        authSection.style.display = 'flex';
        adminApp.style.display = 'none';
      }
    } catch (e) {
      console.warn('Aviso ao checar autenticação:', e);
      authSection.style.display = 'flex';
      adminApp.style.display = 'none';
    }
  }

  // Submissão do login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (window.TENANT_PROMISE) {
        try { await window.TENANT_PROMISE; } catch (err) {}
      }
      
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || db));
      if (!isSupabaseConfigured() || !client) {
        showToast('As credenciais do banco desta loja ainda não foram carregadas. Recarregue a página.', 'error', 5000);
        return;
      }

      const email = loginEmailInput.value.trim();
      const password = loginPasswordInput.value;

      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'Autenticando...';

      try {
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          showToast(`Erro de login: ${error.message}`, 'error', 4500);
        } else if (data && data.user) {
          showToast('Login realizado com sucesso!', 'success');
          checkAuthAndInit();
        }
      } catch (err) {
        showToast(`Falha ao conectar: ${err.message}`, 'error');
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = 'Entrar no Painel';
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logoutAdmin();
    });
  }

  // ==========================================================================
  // Funções Auxiliares de Parsing
  // ==========================================================================

  function parseImages(imgField) {
    if (!imgField) return ['assets/images/logo-simbolo.png'];
    if (Array.isArray(imgField)) return imgField.filter(Boolean);
    if (typeof imgField === 'string') {
      try {
        const parsed = JSON.parse(imgField);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {
        const list = imgField.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (list.length > 0) return list;
        return [imgField.trim()];
      }
    }
    return ['assets/images/logo-simbolo.png'];
  }

  function parseSizes(sizesField) {
    if (!sizesField) return {};
    if (typeof sizesField === 'object' && !Array.isArray(sizesField)) return sizesField;
    if (typeof sizesField === 'string') {
      try {
        const parsed = JSON.parse(sizesField);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  // ==========================================================================
  // Carregamento de Dados (Produtos + Indicadores Financeiros)
  // ==========================================================================

  async function loadFinancials() {
    tableSpinner.style.display = 'block';
    financialsTableBody.innerHTML = '';
    if (adminVisualGrid) adminVisualGrid.innerHTML = '';
    tableEmptyMsg.style.display = 'none';

    try {
      if (window.TENANT_PROMISE) {
        try { await window.TENANT_PROMISE; } catch (e) {}
      }

      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || db)) ||
                     (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

      let productsData = null;
      let prodErr = null;

      // 1. Busca os produtos diretamente da tabela products
      if (client && isSupabaseConfigured()) {
        try {
          const res = await client
            .from('products')
            .select('*')
            .order('name');

          if (res.error) {
            prodErr = res.error;
            console.warn('Aviso ao consultar tabela products no Supabase:', res.error);
          } else if (res.data) {
            productsData = res.data;
          }
        } catch (fetchErr) {
          prodErr = fetchErr;
          console.warn('Erro de rede ao consultar products:', fetchErr);
        }
      }

      // 2. Tenta buscar da view products_financials de forma totalmente isolada (sem travar a página)
      const financialsMap = new Map();
      if (client && isSupabaseConfigured()) {
        try {
          const { data: finData, error: finErr } = await client.from('products_financials').select('*');
          if (!finErr && finData && Array.isArray(finData)) {
            finData.forEach(row => {
              const id = row.id || row.product_id;
              if (id) financialsMap.set(id, row);
            });
          }
        } catch (viewErr) {
          console.info('View products_financials não disponível (usando dados de products):', viewErr);
        }
      }

      // Se obteve dados do banco, salva em cache local
      if (productsData && Array.isArray(productsData) && productsData.length > 0) {
        try {
          localStorage.setItem('soleria_cached_products', JSON.stringify(productsData));
        } catch (e) {}
      } else {
        // Tenta recuperar do cache local se a consulta retornou vazia ou com falha
        try {
          const cached = localStorage.getItem('soleria_cached_products');
          if (cached) {
            productsData = JSON.parse(cached);
          }
        } catch (e) {}
      }

      // Notifica erro apenas se falhou de forma fatal e não há dados em memória
      if (prodErr && (!productsData || productsData.length === 0)) {
        console.error('Falha de banco de dados ao buscar catálogo:', prodErr);
        showToast('Falha na comunicação com o banco de dados.', 'error');
      }

      const productsList = productsData || [];

      rawFinancialsData = productsList.map(prod => {
        const finRow = financialsMap.get(prod.id) || {};
        const productCost = Number(finRow.product_cost ?? finRow['Custo produto'] ?? prod.product_cost ?? 0);
        const suppliesCost = Number(finRow.supplies_cost ?? finRow['Custo insumos'] ?? 0);
        const totalCost = Number(finRow.total_cost ?? finRow['Custo total'] ?? (productCost + suppliesCost));
        const salePrice = Number(finRow.sale_price ?? finRow['Preço de venda'] ?? prod.sale_price ?? 0);
        const unitProfit = Number(finRow.unit_profit ?? finRow['Lucro unitário'] ?? (salePrice - totalCost));
        
        const sizes = parseSizes(prod.sizes);
        const sizesValues = Object.values(sizes);
        const totalStockFromSizes = sizesValues.length > 0 
          ? sizesValues.reduce((a, b) => a + Number(b), 0)
          : null;

        const stock = totalStockFromSizes !== null 
          ? totalStockFromSizes 
          : Number(finRow.stock ?? finRow['Estoque'] ?? prod.stock ?? 0);

        const totalProfit = Number(finRow.total_profit ?? finRow['Lucro total do item'] ?? (unitProfit * stock));
        const status = (prod.status || finRow.status || 'ativo').toLowerCase();

        return {
          id: prod.id,
          sku: prod.sku || finRow.sku || 'N/A',
          name: prod.name || finRow.name || 'Sem Nome',
          category: prod.category || finRow.category || 'Geral',
          productCost,
          suppliesCost,
          totalCost,
          salePrice,
          unitProfit,
          stock,
          totalProfit,
          status,
          images: prod.images,
          sizes: sizes
        };
      });

      renderAllViews();
    } catch (err) {
      console.error('Erro geral ao processar dados:', err);
      if (!rawFinancialsData || rawFinancialsData.length === 0) {
        showToast('Falha na comunicação com o banco de dados.', 'error');
      }
    } finally {
      tableSpinner.style.display = 'none';
    }
  }

  // ==========================================================================
  // Renderização Consolidada (Vitrine Visual & Planilha)
  // ==========================================================================

  function renderAllViews() {
    const q = (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const selectedStatus = (statusFilter ? statusFilter.value : 'todos');

    const filtered = rawFinancialsData.filter(item => {
      const matchStatus = selectedStatus === 'todos' || item.status === selectedStatus;
      const matchSearch = !q || 
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);

      return matchStatus && matchSearch;
    });

    // 1. Atualiza KPIs Globais
    let totalInvested = 0;
    let totalProjectedProfit = 0;
    let totalStockPieces = 0;

    rawFinancialsData.forEach(item => {
      totalInvested += (item.totalCost * item.stock);
      totalProjectedProfit += item.totalProfit;
      totalStockPieces += item.stock;
    });

    if (kpiCapitalInvestido) kpiCapitalInvestido.textContent = formatBRL(totalInvested);
    if (kpiLucroProjetado) kpiLucroProjetado.textContent = formatBRL(totalProjectedProfit);
    if (kpiTotalItens) kpiTotalItens.textContent = `${totalStockPieces} unidades`;
    if (kpiSkusCount) kpiSkusCount.textContent = `${rawFinancialsData.length} modelos cadastrados`;

    if (filtered.length === 0) {
      tableEmptyMsg.style.display = 'block';
      if (adminVisualGrid) adminVisualGrid.innerHTML = '';
      financialsTableBody.innerHTML = '';
      return;
    }

    tableEmptyMsg.style.display = 'none';

    renderVisualGrid(filtered);
    renderFinancialsTable(filtered);
    renderDashboard360();
  }

  // ==========================================================================
  // 1. Vitrine Visual de Baixa Rápida
  // ==========================================================================

  function renderVisualGrid(items) {
    if (!adminVisualGrid) return;
    adminVisualGrid.innerHTML = '';

    items.forEach(item => {
      const images = parseImages(item.images);
      const imgUrl = images[0] || 'assets/images/logo-simbolo.png';
      const sizes = item.sizes || {};
      const sizeEntries = Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0]));
      const isRing = (item.category && item.category.toLowerCase().includes('an')) || sizeEntries.length > 0;

      const card = document.createElement('div');
      card.className = 'admin-visual-card';

      // Monta HTML de Ações: Aros se for anel, botão simples se for outra categoria
      let actionsHtml = '';
      if (isRing) {
        if (sizeEntries.length > 0) {
          const arosChipsHtml = sizeEntries.map(([aro, qty]) => {
            const count = Number(qty) || 0;
            const isOutOfStock = count <= 0;
            return `
              <span class="admin-aro-chip ${isOutOfStock ? 'out-of-stock' : ''}" style="cursor: default;" title="${isOutOfStock ? 'Aro Esgotado' : `${count} unidade(s) disponível(is)`}">
                Aro ${aro} <strong>(${count})</strong>
              </span>
            `;
          }).join('');

          actionsHtml = `
            <div>
              <div class="admin-visual-actions-title">💍 Grade de Aros no Estoque:</div>
              <div class="admin-visual-aros-list">
                ${arosChipsHtml}
              </div>
            </div>
          `;
        } else {
          actionsHtml = `
            <div>
              <div class="admin-visual-actions-title">💍 Aros do Anel:</div>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                Grade não configurada. <a href="admin-editar-produto?id=${item.id}" style="color: var(--brand-terracotta);">Configurar &rarr;</a>
              </span>
            </div>
          `;
        }
      } else {
        actionsHtml = `
          <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Estoque central: <strong>${item.stock} un disponíveis</strong>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="admin-visual-top">
          <img src="${imgUrl}" alt="${item.name}" class="admin-visual-img" loading="lazy" onerror="this.src='assets/images/logo-simbolo.png'">
          <div class="admin-visual-meta">
            <span class="admin-visual-sku">${item.sku}</span>
            <div class="admin-visual-name" title="${item.name}">${item.name}</div>
            <span class="admin-visual-price">${formatBRL(item.salePrice)}</span>
          </div>
        </div>

        <div class="admin-visual-body">
          <div class="admin-visual-stock-row">
            <span style="font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;">
              ${item.category}
            </span>
            <span class="admin-visual-stock-badge ${item.stock > 0 ? 'has-stock' : 'empty-stock'}">
              ${item.stock > 0 ? `${item.stock} un disponíveis` : 'Esgotado'}
            </span>
          </div>

          ${actionsHtml}
        </div>

        <div class="admin-visual-footer">
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            Lucro unit: <strong style="color: #216E39;">${formatBRL(item.unitProfit)}</strong>
          </span>
          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <a href="admin-pedidos?novo=true" class="btn-primary" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Registrar venda formal vinculada a pedido">
              + Vender
            </a>
            <a href="admin-editar-produto?id=${item.id}" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto">
              Editar
            </a>
          </div>
        </div>
      `;

      adminVisualGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // 2. Renderização da Planilha Financeira
  // ==========================================================================

  function renderFinancialsTable(filtered) {
    financialsTableBody.innerHTML = '';

    filtered.forEach(item => {
      const tr = document.createElement('tr');

      const statusBadge = item.status === 'ativo'
        ? `<span class="status-badge status-ativo"><span class="badge-dot"></span> Ativo</span>`
        : `<span class="status-badge status-inativo"><span class="badge-dot"></span> Inativo</span>`;

      const stockBadge = item.stock <= 2
        ? `<span style="color: #9B2C2C; font-weight: 700;">${item.stock}</span> <span style="font-size: 0.68rem; color: #9B2C2C;">(Baixo)</span>`
        : `<span>${item.stock}</span>`;

      tr.innerHTML = `
        <td class="sku-cell">${item.sku}</td>
        <td style="font-weight: 500;">${item.name}</td>
        <td><span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary);">${item.category}</span></td>
        <td style="text-align: right;" class="val-currency">${formatBRL(item.productCost)}</td>
        <td style="text-align: right;" class="val-currency">${formatBRL(item.suppliesCost)}</td>
        <td style="text-align: right;" class="val-currency" style="font-weight: 600;">${formatBRL(item.totalCost)}</td>
        <td style="text-align: right;" class="val-currency">${formatBRL(item.salePrice)}</td>
        <td style="text-align: right;" class="val-profit">${formatBRL(item.unitProfit)}</td>
        <td style="text-align: center;">${stockBadge}</td>
        <td style="text-align: right;" class="val-profit" style="font-weight: 700;">${formatBRL(item.totalProfit)}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center;">
          ${item.id ? `
            <a href="admin-editar-produto?id=${item.id}" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto e insumos">
              Editar
            </a>
          ` : `
            <span style="color: var(--text-muted); font-size: 0.7rem;">—</span>
          `}
        </td>
      `;

      financialsTableBody.appendChild(tr);
    });
  }

  // ==========================================================================
  // Alternador de Visualização (Vitrine de Baixa vs Planilha)
  // ==========================================================================

  if (btnViewVisual && btnViewTable) {
    btnViewVisual.addEventListener('click', () => {
      btnViewVisual.classList.add('active');
      btnViewTable.classList.remove('active');
      if (adminVisualGrid) adminVisualGrid.style.display = 'grid';
      if (tableResponsiveContainer) tableResponsiveContainer.style.display = 'none';
    });

    btnViewTable.addEventListener('click', () => {
      btnViewTable.classList.add('active');
      btnViewVisual.classList.remove('active');
      if (adminVisualGrid) adminVisualGrid.style.display = 'none';
      if (tableResponsiveContainer) tableResponsiveContainer.style.display = 'block';
    });
  }

  // ==========================================================================
  // Etapa 5.5: Exportação de Inventário e Custos para Planilha CSV
  // ==========================================================================

  function exportInventoryToCSV() {
    if (!rawFinancialsData || rawFinancialsData.length === 0) {
      showToast('Nenhum produto disponível para exportar.', 'warning');
      return;
    }

    const headers = [
      'SKU',
      'Produto',
      'Categoria',
      'Estoque_Atual',
      'Custo_Peca_RS',
      'Custo_Insumos_RS',
      'Custo_Total_RS',
      'Preco_Venda_RS',
      'Lucro_Unitario_RS',
      'Lucro_Total_Projetado_RS',
      'Status'
    ];

    const rows = rawFinancialsData.map(p => [
      `"${p.sku}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      p.stock,
      p.productCost.toFixed(2),
      p.suppliesCost.toFixed(2),
      p.totalCost.toFixed(2),
      p.salePrice.toFixed(2),
      p.unitProfit.toFixed(2),
      p.totalProfit.toFixed(2),
      `"${p.status}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `soleria_inventario_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha de inventário exportada com sucesso!', 'success');
  }

  const btnExportInv = document.getElementById('btn-export-inventory-csv');
  if (btnExportInv) {
    btnExportInv.addEventListener('click', exportInventoryToCSV);
  }

  // Listeners de filtro e busca
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderAllViews();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      renderAllViews();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadAllData();
      showToast('Dados de estoque recarregados.', 'info');
    });
  }

  // ==========================================================================
  // Controle de Abas (Visão Geral 360 vs Posição de Estoque)
  // ==========================================================================

  function switchTab(targetTab) {
    if (targetTab === 'inventory') {
      if (viewDashboard360) viewDashboard360.style.display = 'none';
      if (viewEstoqueInventory) viewEstoqueInventory.style.display = 'block';
      if (btnTabDashboard) btnTabDashboard.classList.remove('active');
      if (btnTabInventory) btnTabInventory.classList.add('active');
      if (navItemDashboard) navItemDashboard.classList.remove('active');
      if (navItemEstoque) navItemEstoque.classList.add('active');
      window.history.replaceState(null, '', '?tab=estoque');
    } else {
      if (viewDashboard360) viewDashboard360.style.display = 'block';
      if (viewEstoqueInventory) viewEstoqueInventory.style.display = 'none';
      if (btnTabDashboard) btnTabDashboard.classList.add('active');
      if (btnTabInventory) btnTabInventory.classList.remove('active');
      if (navItemDashboard) navItemDashboard.classList.add('active');
      if (navItemEstoque) navItemEstoque.classList.remove('active');
      window.history.replaceState(null, '', 'admin');
    }
  }

  if (btnTabDashboard) btnTabDashboard.addEventListener('click', () => switchTab('dashboard'));
  if (btnTabInventory) btnTabInventory.addEventListener('click', () => switchTab('inventory'));
  if (navItemDashboard) navItemDashboard.addEventListener('click', (e) => { e.preventDefault(); switchTab('dashboard'); });
  if (navItemEstoque) navItemEstoque.addEventListener('click', (e) => { e.preventDefault(); switchTab('inventory'); });
  if (btnGotoInventoryTab) btnGotoInventoryTab.addEventListener('click', () => switchTab('inventory'));
  if (btnRefreshDashboard) btnRefreshDashboard.addEventListener('click', () => {
    loadAllData();
    showToast('Dashboard atualizado com sucesso!', 'info');
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'estoque' || window.location.hash === '#estoque') {
    switchTab('inventory');
  } else {
    switchTab('dashboard');
  }

  // ==========================================================================
  // Carregamento de Pedidos e Clientes Unificados para o Dashboard 360
  // ==========================================================================

  async function loadAllData() {
    await Promise.all([
      loadFinancials(),
      loadOrdersAndCustomers()
    ]);
    renderDashboard360();
  }

  async function loadOrdersAndCustomers() {
    try {
      if (window.TENANT_PROMISE) {
        try { await window.TENANT_PROMISE; } catch (e) {}
      }

      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) ||
                     (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

      if (client && isSupabaseConfigured()) {
        const [ordersRes, customersRes] = await Promise.all([
          client.from('orders').select('*').order('created_at', { ascending: false }),
          client.from('customers').select('*').order('created_at', { ascending: false })
        ]);

        if (ordersRes && ordersRes.data) {
          rawOrdersData = ordersRes.data;
        } else {
          rawOrdersData = getFallbackOrders();
        }

        if (customersRes && customersRes.data) {
          rawCustomersData = customersRes.data;
        } else {
          rawCustomersData = getFallbackCustomers();
        }
      } else {
        rawOrdersData = getFallbackOrders();
        rawCustomersData = getFallbackCustomers();
      }

      // Mesclagem com pedidos do LocalStorage: garante que alterações recentes (cancelamentos, baixas parciais) prevaleçam
      try {
        const local = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
        if (local && Array.isArray(local) && local.length > 0) {
          local.forEach(loc => {
            const idx = rawOrdersData.findIndex(o => o.order_number === loc.order_number);
            if (idx !== -1) {
              rawOrdersData[idx] = { ...rawOrdersData[idx], ...loc };
            } else {
              rawOrdersData.push(loc);
            }
          });
        }
      } catch (e) {}
    } catch (e) {
      console.warn('Erro ao carregar dados complementares para o Dashboard 360:', e);
      rawOrdersData = getFallbackOrders();
      rawCustomersData = getFallbackCustomers();
    }
  }

  function getFallbackOrders() {
    try {
      const mergedMap = new Map();
      const keys = ['soleria_local_orders', 'soleria_orders', 'soleria_orders_db_v1', 'soleria_orders_v1'];
      keys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              list.forEach(o => {
                if (o && o.order_number && !mergedMap.has(o.order_number)) {
                  mergedMap.set(o.order_number, o);
                }
              });
            }
          } catch (e) {}
        }
      });
      return Array.from(mergedMap.values());
    } catch (e) {
      return [];
    }
  }

  function getFallbackCustomers() {
    try {
      const raw = localStorage.getItem('soleria_customers') ||
                  localStorage.getItem('soleria_customers_db_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // ==========================================================================
  // Renderizadores do Dashboard 360°
  // ==========================================================================

  function renderDashboard360() {
    // 1. Processamento Financeiro e Vendas Preciso (Considera Baixas Parciais e Ignora Cancelados)
    const completedStatuses = ['confirmado', 'preparacao', 'enviado', 'entregue'];

    let totalFaturamentoRealizado = 0;
    let totalPendenteReceber = 0;
    let totalVendasConfirmadas = 0;
    let monthRevenue = 0;
    let monthOrdersCount = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    rawOrdersData.forEach(o => {
      // Pedidos cancelados NUNCA entram no faturamento, nem no pendente, nem nas vendas confirmadas!
      if (isOrderCancelled(o)) return;

      const pay = getOrderPaymentInfo(o);
      const st = (o.status || '').toLowerCase().trim();

      // Faturamento Realizado = dinheiro que efetivamente já entrou no caixa (quitados 100% + entradas parciais recebidas)
      if (pay.paid > 0) {
        totalFaturamentoRealizado += pay.paid;
      }

      // Saldo que ainda falta receber dos pedidos ativos
      if (pay.due > 0) {
        totalPendenteReceber += pay.due;
      }

      // Considera venda confirmada se quitado, em andamento ou se houve entrada paga
      const isConfirmed = pay.isPaid || pay.isPartial || completedStatuses.includes(st);
      if (isConfirmed) {
        totalVendasConfirmadas++;
      }

      // Vendas do mês atual (valores recebidos em pedidos deste mês)
      if (o.created_at) {
        const d = new Date(o.created_at);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          if (pay.paid > 0) {
            monthRevenue += pay.paid;
          }
          if (isConfirmed) {
            monthOrdersCount++;
          }
        }
      }
    });

    const avgTicket = totalVendasConfirmadas > 0 ? (totalFaturamentoRealizado / totalVendasConfirmadas) : 0;

    // Capital investido e estoque de peças
    let totalInvested = 0;
    let totalStockPieces = 0;
    rawFinancialsData.forEach(item => {
      totalInvested += (item.totalCost * item.stock);
      totalStockPieces += item.stock;
    });

    // 1. Consolidação de Clientes e Compradoras (Base Unificada)
    const allCustomersMap = new Map();

    // Clientes cadastrados na base
    (rawCustomersData || []).forEach(c => {
      const cleanCpf = c.cpf ? String(c.cpf).replace(/\D/g, '') : '';
      const cleanPhone = c.phone ? String(c.phone).replace(/\D/g, '') : '';
      const key = cleanCpf || cleanPhone || (c.email ? c.email.trim().toLowerCase() : (c.id ? String(c.id) : ''));
      if (key) {
        allCustomersMap.set(key, {
          name: c.name || 'Cliente',
          phone: c.phone || '',
          cpf: cleanCpf,
          hasOrders: false
        });
      }
    });

    // Clientes identificados a partir dos pedidos
    const buyersSet = new Set();
    (rawOrdersData || []).forEach(o => {
      const isCancelled = isOrderCancelled(o);
      const cleanCpf = o.customer_cpf ? String(o.customer_cpf).replace(/\D/g, '') : '';
      const cleanPhone = o.customer_phone ? String(o.customer_phone).replace(/\D/g, '') : '';
      const key = cleanCpf || cleanPhone || (o.customer_name ? o.customer_name.trim().toLowerCase() : '');

      if (key) {
        if (!allCustomersMap.has(key)) {
          allCustomersMap.set(key, {
            name: o.customer_name || 'Cliente',
            phone: o.customer_phone || '',
            cpf: cleanCpf,
            hasOrders: !isCancelled
          });
        }
        if (!isCancelled) {
          buyersSet.add(key);
          const entry = allCustomersMap.get(key);
          if (entry) entry.hasOrders = true;
        }
      }
    });

    const totalCustomers = Math.max(allCustomersMap.size, buyersSet.size);
    const buyersCount = buyersSet.size;
    const rawRate = totalCustomers > 0 ? (buyersCount / totalCustomers) * 100 : 0;
    const conversionRate = Math.min(100, Math.max(0, Math.round(rawRate)));

    // Atualiza KPIs Topo
    if (dashKpiFaturamento) dashKpiFaturamento.textContent = formatBRL(totalFaturamentoRealizado);
    if (dashKpiFaturamentoSub) dashKpiFaturamentoSub.textContent = `${totalVendasConfirmadas} vendas confirmadas • ${formatBRL(totalPendenteReceber)} pendente`;
    if (dashKpiVendasMes) dashKpiVendasMes.textContent = formatBRL(monthRevenue);
    if (dashKpiVendasMesCount) dashKpiVendasMesCount.textContent = `${monthOrdersCount} pedido(s) no mês atual`;
    if (dashKpiTicketMedio) dashKpiTicketMedio.textContent = formatBRL(avgTicket);
    if (dashKpiCapitalEstoque) dashKpiCapitalEstoque.textContent = formatBRL(totalInvested);
    if (dashKpiPecasCount) dashKpiPecasCount.textContent = `${totalStockPieces} peças físicas em acervo`;
    if (dashKpiClientesTotal) dashKpiClientesTotal.textContent = String(totalCustomers);
    if (dashKpiClientesSub) dashKpiClientesSub.textContent = `${buyersCount} compradora(s) ativas (${conversionRate}% conversão)`;

    // 2. Pipeline Operacional de Pedidos (Estritamente sem cancelados)
    const statusGroups = {
      recebido: { count: 0, total: 0 },
      prep: { count: 0, total: 0 },
      envio: { count: 0, total: 0 },
      entregue: { count: 0, total: 0 }
    };

    rawOrdersData.forEach(o => {
      // Ignora pedidos cancelados de qualquer status do pipeline
      if (isOrderCancelled(o)) return;

      const st = (o.status || '').toLowerCase().trim();
      const pay = getOrderPaymentInfo(o);

      if (st === 'recebido' || st === 'aguardando_pagamento' || st === 'pendente') {
        // Pedido aguardando PIX / pagamento: soma apenas o saldo que ainda falta pagar
        statusGroups.recebido.count++;
        statusGroups.recebido.total += (pay.due > 0 ? pay.due : pay.total);
      } else if (st === 'confirmado' || st === 'preparacao') {
        statusGroups.prep.count++;
        statusGroups.prep.total += Number(o.total_amount) || 0;
      } else if (st === 'enviado') {
        statusGroups.envio.count++;
        statusGroups.envio.total += Number(o.total_amount) || 0;
      } else if (st === 'entregue') {
        statusGroups.entregue.count++;
        statusGroups.entregue.total += Number(o.total_amount) || 0;
      }
    });

    if (dashCountRecebido) dashCountRecebido.textContent = statusGroups.recebido.count;
    if (dashValRecebido) dashValRecebido.textContent = formatBRL(statusGroups.recebido.total);
    if (dashCountPrep) dashCountPrep.textContent = statusGroups.prep.count;
    if (dashValPrep) dashValPrep.textContent = formatBRL(statusGroups.prep.total);
    if (dashCountEnvio) dashCountEnvio.textContent = statusGroups.envio.count;
    if (dashValEnvio) dashValEnvio.textContent = formatBRL(statusGroups.envio.total);
    if (dashCountEntregue) dashCountEntregue.textContent = statusGroups.entregue.count;
    if (dashValEntregue) dashValEntregue.textContent = formatBRL(statusGroups.entregue.total);

    // 2.5. Notificação de Pedidos com Saldo a Receber (Baixa Parcial)
    const partialOrders = rawOrdersData.filter(o => {
      if (isOrderCancelled(o)) return false;
      const pay = getOrderPaymentInfo(o);
      return pay.isPartial;
    });
    renderPartialNotification(partialOrders);

    // 3. Renderiza Pedidos Mais Recentes
    renderRecentOrders();

    // 4. Renderiza Alertas de Estoque
    renderStockAlerts();

    // 5. Renderiza Top Clientes VIP & CRM
    renderCrmRadar(conversionRate);
  }

  function renderPartialNotification(partialOrders) {
    if (!dashPartialNotification) return;

    if (!partialOrders || partialOrders.length === 0) {
      dashPartialNotification.style.display = 'none';
      return;
    }

    dashPartialNotification.style.display = 'block';
    const totalDue = partialOrders.reduce((sum, o) => sum + getOrderPaymentInfo(o).due, 0);

    if (dashPartialBadgeCount) {
      dashPartialBadgeCount.textContent = `${partialOrders.length} pendência(s)`;
    }
    if (dashPartialTotalDue) {
      dashPartialTotalDue.textContent = formatBRL(totalDue);
    }

    if (dashPartialOrdersList) {
      const html = partialOrders.slice(0, 5).map(o => {
        const pay = getOrderPaymentInfo(o);
        const cleanPhone = (o.customer_phone || '').replace(/\D/g, '');
        const clientFirst = (o.customer_name || 'Cliente').split(' ')[0];
        const waMsg = encodeURIComponent(`Olá, ${clientFirst}! ✨ Passando com muito carinho para conferir o saldo de ${formatBRL(pay.due)} referente ao pedido *${o.order_number}* na Soléria. Suas peças estão guardadas com todo o carinho!`);
        const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${waMsg}` : '#';

        return `
          <div class="dashboard-partial-item">
            <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0; flex-wrap: wrap;">
              <strong style="font-family: monospace; font-size: 0.82rem; color: var(--brand-terracotta);">${o.order_number}</strong>
              <span style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                ${o.customer_name || 'Cliente'}
              </span>
              <span style="font-size: 0.72rem; color: #166534; background: #DCFCE7; padding: 2px 7px; border-radius: 4px; font-weight: 600;">
                Entrada: ${formatBRL(pay.paid)}
              </span>
              <span style="font-size: 0.72rem; color: #991B1B; background: #FEE2E2; padding: 2px 7px; border-radius: 4px; font-weight: 700;">
                Falta: ${formatBRL(pay.due)}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.45rem;">
              ${cleanPhone ? `
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-secondary-action" style="padding: 0.25rem 0.55rem; font-size: 0.72rem; color: #166534; border-color: #86EFAC;" title="Lembrar cliente no WhatsApp">
                  💬 Cobrar WhatsApp
                </a>
              ` : ''}
              <a href="admin-pedidos?pedido=${o.order_number}" class="btn-secondary-action" style="padding: 0.25rem 0.55rem; font-size: 0.72rem;" title="Abrir pedido para dar baixa no restante">
                Dar Baixa &rarr;
              </a>
            </div>
          </div>
        `;
      }).join('');

      dashPartialOrdersList.innerHTML = html;
    }
  }

  function renderRecentOrders() {
    if (!dashRecentOrdersList) return;
    if (rawOrdersData.length === 0) {
      dashRecentOrdersList.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.82rem;">
          Nenhum pedido registrado no sistema ainda.
        </div>
      `;
      return;
    }

    const recent = rawOrdersData.slice(0, 5);
    const html = recent.map(o => {
      const st = (o.status || 'recebido').toLowerCase();
      let badgeClass = 'status-recebido';
      let badgeLabel = 'Aguardando Pagamento';
      if (st === 'confirmado' || st === 'preparacao') { badgeClass = 'status-preparacao'; badgeLabel = 'Em Preparação'; }
      else if (st === 'enviado') { badgeClass = 'status-enviado'; badgeLabel = 'A Caminho'; }
      else if (st === 'entregue') { badgeClass = 'status-entregue'; badgeLabel = 'Entregue'; }
      else if (st === 'cancelado') { badgeClass = 'status-cancelado'; badgeLabel = 'Cancelado'; }

      const pay = getOrderPaymentInfo(o);
      const partialTag = (pay.isPartial && st !== 'cancelado')
        ? `<span style="font-size: 0.64rem; padding: 0.15rem 0.45rem; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; border-radius: 4px; font-weight: 700;">🟡 Falta ${formatBRL(pay.due)}</span>`
        : '';

      const itemCount = Array.isArray(o.items) ? o.items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0) : 1;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.65rem 0.5rem; border-bottom: 1px solid var(--border-subtle); flex-wrap: wrap;">
          <div style="display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <strong style="font-family: monospace; font-size: 0.85rem; color: var(--brand-terracotta);">${o.order_number}</strong>
              <span class="order-badge ${badgeClass}" style="font-size: 0.64rem; padding: 0.15rem 0.45rem;">${badgeLabel}</span>
              ${partialTag}
            </div>
            <span style="font-size: 0.8rem; color: var(--text-primary); margin-top: 0.15rem; font-weight: 500;">
              ${o.customer_name || 'Cliente'} &bull; <span style="color: var(--text-muted);">${itemCount} peça(s)</span>
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <strong style="font-size: 0.92rem; color: var(--text-primary); font-variant-numeric: tabular-nums;">
              ${formatBRL(o.total_amount)}
            </strong>
            <a href="admin-pedidos?pedido=${o.order_number}" class="btn-secondary-action" style="padding: 0.35rem 0.65rem; font-size: 0.74rem;" title="Abrir gestão deste pedido">
              Gerenciar &rarr;
            </a>
          </div>
        </div>
      `;
    }).join('');

    dashRecentOrdersList.innerHTML = html;
  }

  function renderStockAlerts() {
    if (!dashStockAlertsList) return;
    const activeProducts = rawFinancialsData.filter(p => p.status === 'ativo');
    const esgotados = activeProducts.filter(p => p.stock === 0);
    const baixoEstoque = activeProducts.filter(p => p.stock > 0 && p.stock <= 2);

    if (dashAlertEsgotados) dashAlertEsgotados.textContent = `${esgotados.length} modelos`;
    if (dashAlertBaixo) dashAlertBaixo.textContent = `${baixoEstoque.length} modelos`;

    const criticalItems = [...esgotados, ...baixoEstoque];
    if (criticalItems.length === 0) {
      dashStockAlertsList.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: #166534; background: #F0FDF4; border-radius: 8px; font-size: 0.82rem; font-weight: 500;">
          ✓ Excelente! Todas as joias ativas estão com estoque saudável.
        </div>
      `;
      return;
    }

    const itemsToShow = criticalItems.slice(0, 6);
    const html = itemsToShow.map(p => {
      const img = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : 'assets/images/logo-simbolo.png';
      const isOut = p.stock === 0;
      const badgeHtml = isOut 
        ? `<span style="background: #FEE2E2; color: #DC2626; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.68rem; font-weight: 700;">Esgotado</span>`
        : `<span style="background: #FEF3C7; color: #D97706; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.68rem; font-weight: 700;">Restam ${p.stock} un.</span>`;

      return `
        <div class="dashboard-stock-alert-item">
          <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
            <img src="${img}" alt="${p.name}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-subtle); flex-shrink: 0;" onerror="this.src='assets/images/logo-simbolo.png'">
            <div style="min-width: 0;">
              <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                ${p.name}
              </div>
              <span style="font-family: monospace; font-size: 0.7rem; color: var(--text-muted);">${p.sku} &bull; ${p.category}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
            ${badgeHtml}
            <a href="admin-editar-produto?id=${p.id}" class="btn-secondary-action" style="padding: 0.3rem 0.55rem; font-size: 0.72rem;" title="Editar estoque e insumos desta joia">
              Editar &rarr;
            </a>
          </div>
        </div>
      `;
    }).join('');

    dashStockAlertsList.innerHTML = html;
  }

  function renderCrmRadar(conversionRate) {
    if (!dashTopClientsList) return;
    if (dashCrmConversao) dashCrmConversao.textContent = `${conversionRate}%`;

    // Agrupa compras por cliente (apenas pedidos válidos / não cancelados)
    const clientsMap = new Map();
    rawOrdersData.forEach(o => {
      if ((o.status || '').toLowerCase() === 'cancelado') return;
      const key = o.customer_cpf ? String(o.customer_cpf).replace(/\D/g, '') : (o.customer_phone ? String(o.customer_phone).replace(/\D/g, '') : (o.customer_name || 'Desconhecido'));
      if (!clientsMap.has(key)) {
        clientsMap.set(key, {
          name: o.customer_name || 'Cliente',
          phone: o.customer_phone || '',
          ordersCount: 0,
          totalSpent: 0
        });
      }
      const client = clientsMap.get(key);
      client.ordersCount++;
      client.totalSpent += (Number(o.total_amount) || 0);
    });

    const buyersList = Array.from(clientsMap.values()).filter(c => c.totalSpent > 0);
    buyersList.sort((a, b) => b.totalSpent - a.totalSpent);

    const totalBuyers = buyersList.length;
    const totalSpentAll = buyersList.reduce((acc, c) => acc + c.totalSpent, 0);
    const avgLtv = totalBuyers > 0 ? (totalSpentAll / totalBuyers) : 0;
    if (dashCrmLtv) dashCrmLtv.textContent = formatBRL(avgLtv);

    if (buyersList.length === 0) {
      dashTopClientsList.innerHTML = `
        <div style="text-align: center; padding: 1.25rem; color: var(--text-muted); font-size: 0.8rem;">
          Nenhuma compra registrada por clientes ainda.
        </div>
      `;
      return;
    }

    const topClients = buyersList.slice(0, 4);
    const html = topClients.map(c => {
      const cleanPhone = (c.phone || '').replace(/\D/g, '');
      const initials = (c.name || 'C').split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
      const waMsg = encodeURIComponent(`Olá, ${c.name.split(' ')[0]}! Tudo bem? Passando para agradecer por escolher a Soléria e conferir se precisa de algo especial!`);
      const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${waMsg}` : '#';

      return `
        <div class="dashboard-vip-item">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div class="dashboard-avatar">${initials}</div>
            <div>
              <strong style="font-size: 0.82rem; color: var(--text-primary); display: block;">${c.name}</strong>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${c.ordersCount} pedido(s) realizados</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <strong style="font-size: 0.88rem; color: var(--brand-terracotta);">${formatBRL(c.totalSpent)}</strong>
            ${cleanPhone ? `
              <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-secondary-action" style="padding: 0.3rem 0.55rem; font-size: 0.72rem; color: #166534; border-color: #86EFAC;" title="Conversar no WhatsApp">
                💬
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    dashTopClientsList.innerHTML = html;
  }

  // Inicializa verificação de autenticação
  checkAuthAndInit();
});

