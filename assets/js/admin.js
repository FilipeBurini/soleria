/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Painel Administrativo: Autenticação, métricas e tabela de estoque financeira
 */

document.addEventListener('DOMContentLoaded', async () => {
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

  let rawFinancialsData = [];

  // ==========================================================================
  // Fluxo de Autenticação
  // ==========================================================================

  async function checkAuthAndInit() {
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
      loadFinancials();
    } else {
      // Não autenticado: mostra formulário de login
      authSection.style.display = 'flex';
      adminApp.style.display = 'none';
    }
  }

  // Submissão do login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!isSupabaseConfigured()) {
        showToast('Configure a URL e chave do Supabase em assets/js/supabase.js antes de logar.', 'error', 5000);
        return;
      }

      const email = loginEmailInput.value.trim();
      const password = loginPasswordInput.value;

      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'Autenticando...';

      try {
        const { data, error } = await db.auth.signInWithPassword({
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
      // 1. Busca os produtos diretamente da tabela products para garantir acesso a imagens e tamanhos
      const { data: productsData, error: prodErr } = await db
        .from('products')
        .select('*')
        .order('name');

      if (prodErr) {
        console.warn('Erro ao consultar tabela products:', prodErr);
      }

      // 2. Tenta buscar da view products_financials para obter custos precisos de insumos
      const financialsMap = new Map();
      const { data: finData } = await db.from('products_financials').select('*');
      if (finData && Array.isArray(finData)) {
        finData.forEach(row => {
          const id = row.id || row.product_id;
          if (id) financialsMap.set(id, row);
        });
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
      showToast('Falha na comunicação com o banco de dados.', 'error');
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
              <button type="button" 
                class="admin-aro-chip ${isOutOfStock ? 'out-of-stock' : ''}" 
                data-id="${item.id}" 
                data-aro="${aro}"
                ${isOutOfStock ? 'disabled' : ''}
                title="${isOutOfStock ? 'Aro Esgotado' : `Clique para dar baixa de 1 unidade no Aro ${aro}`}">
                Aro ${aro} <strong>(${count})</strong>
              </button>
            `;
          }).join('');

          actionsHtml = `
            <div>
              <div class="admin-visual-actions-title">💍 Baixa Rápida por Aro (clique para -1 un):</div>
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
                Grade não configurada. <a href="admin-editar-produto.html?id=${item.id}" style="color: var(--brand-terracotta);">Configurar &rarr;</a>
              </span>
            </div>
          `;
        }
      } else {
        const canDeduct = item.stock > 0;
        actionsHtml = `
          <div>
            <div class="admin-visual-actions-title">⚡ Baixa Rápida de Estoque:</div>
            <button type="button" 
              class="btn-admin-deduct btn-deduct-simple" 
              data-id="${item.id}"
              ${!canDeduct ? 'disabled' : ''}
              style="padding: 0.5rem 1rem; font-size: 0.78rem;">
              <span>⚡ Registrar Venda (-1 un)</span>
            </button>
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
          <a href="admin-editar-produto.html?id=${item.id}" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto">
            Editar Cadastro
          </a>
        </div>
      `;

      adminVisualGrid.appendChild(card);
    });

    // Event listeners para cliques nos aros (chips)
    adminVisualGrid.querySelectorAll('.admin-aro-chip:not(.out-of-stock)').forEach(chip => {
      chip.addEventListener('click', async (e) => {
        e.preventDefault();
        const prodId = chip.dataset.id;
        const aro = chip.dataset.aro;
        await handleQuickDeduct(prodId, aro, chip);
      });
    });

    // Event listeners para botão de baixa simples (não-anel)
    adminVisualGrid.querySelectorAll('.btn-deduct-simple').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const prodId = btn.dataset.id;
        await handleQuickDeduct(prodId, null, btn);
      });
    });
  }

  // ==========================================================================
  // Processamento de Baixa Rápida de Estoque no Supabase
  // ==========================================================================

  async function handleQuickDeduct(productId, aro, triggerElem) {
    const item = rawFinancialsData.find(p => p.id === productId);
    if (!item) return;

    if (triggerElem) {
      triggerElem.disabled = true;
      triggerElem.style.opacity = '0.6';
    }

    try {
      if (aro) {
        // Baixa em anel por aro específico
        const currentSizes = { ...item.sizes };
        const currentQty = Number(currentSizes[aro]) || 0;
        if (currentQty <= 0) {
          showToast(`Aro ${aro} já está esgotado!`, 'warning');
          return;
        }

        currentSizes[aro] = currentQty - 1;
        const newTotalStock = Object.values(currentSizes).reduce((a, b) => a + Number(b), 0);

        const { error } = await db
          .from('products')
          .update({ sizes: currentSizes, stock: newTotalStock })
          .eq('id', productId);

        if (error) throw error;

        item.sizes = currentSizes;
        item.stock = newTotalStock;
        item.totalProfit = item.unitProfit * newTotalStock;

        showToast(`Baixa registrada com sucesso! Aro ${aro} agora possui ${item.sizes[aro]} un.`, 'success');
        renderAllViews();
      } else {
        // Baixa em peça comum
        const currentStock = Number(item.stock) || 0;
        if (currentStock <= 0) {
          showToast('Esta peça já está esgotada!', 'warning');
          return;
        }

        const newTotalStock = currentStock - 1;
        const { error } = await db
          .from('products')
          .update({ stock: newTotalStock })
          .eq('id', productId);

        if (error) throw error;

        item.stock = newTotalStock;
        item.totalProfit = item.unitProfit * newTotalStock;

        showToast(`Venda registrada com sucesso! Restam ${newTotalStock} unidades.`, 'success');
        renderAllViews();
      }
    } catch (err) {
      console.error('Erro ao dar baixa:', err);
      showToast('Erro ao atualizar estoque: ' + (err.message || err), 'error');
    } finally {
      if (triggerElem) {
        triggerElem.disabled = false;
        triggerElem.style.opacity = '';
      }
    }
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
            <a href="admin-editar-produto.html?id=${item.id}" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto e insumos">
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
      loadFinancials();
      showToast('Dados recarregados.', 'info');
    });
  }

  // Inicializa verificação de autenticação
  checkAuthAndInit();
});

