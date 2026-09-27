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
  // Carregamento da View products_financials
  // ==========================================================================

  /**
   * Normaliza os campos da view para suportar nomes em minúsculo ou com acentos
   */
  function normalizeFinancialRow(row) {
    const sku = row.sku || row.SKU || 'N/A';
    const name = row.name || row.Nome || 'Sem Nome';
    const category = row.category || row.Categoria || 'Geral';
    const productCost = Number(row.product_cost ?? row['Custo produto'] ?? row.cost ?? 0);
    const suppliesCost = Number(row.supplies_cost ?? row['Custo insumos'] ?? 0);
    const totalCost = Number(row.total_cost ?? row['Custo total'] ?? (productCost + suppliesCost));
    const salePrice = Number(row.sale_price ?? row['Preço de venda'] ?? 0);
    const unitProfit = Number(row.unit_profit ?? row['Lucro unitário'] ?? (salePrice - totalCost));
    const stock = Number(row.stock ?? row['Estoque'] ?? 0);
    const totalProfit = Number(row.total_profit ?? row['Lucro total do item'] ?? (unitProfit * stock));
    const status = (row.status || row.Status || 'ativo').toLowerCase();
    const id = row.id || row.product_id;

    return {
      id,
      sku,
      name,
      category,
      productCost,
      suppliesCost,
      totalCost,
      salePrice,
      unitProfit,
      stock,
      totalProfit,
      status
    };
  }

  async function loadFinancials() {
    tableSpinner.style.display = 'block';
    financialsTableBody.innerHTML = '';
    tableEmptyMsg.style.display = 'none';

    try {
      // 1. Tenta carregar da view products_financials
      let { data, error } = await db
        .from('products_financials')
        .select('*');

      // Se a view não existir ou retornar erro de permissão, fallback para tabela products
      if (error) {
        console.warn('View products_financials não encontrada ou inacessível. Tentando tabela products...', error);
        const fallback = await db.from('products').select('*');
        if (fallback.data) {
          data = fallback.data;
          error = null;
        }
      }

      if (error) {
        console.error('Erro ao buscar dados:', error);
        showToast('Erro ao carregar dados financeiros: ' + error.message, 'error');
        tableEmptyMsg.style.display = 'block';
      } else if (!data || data.length === 0) {
        rawFinancialsData = [];
        renderFinancialsTable();
        tableEmptyMsg.style.display = 'block';
      } else {
        rawFinancialsData = data.map(normalizeFinancialRow);
        renderFinancialsTable();
      }
    } catch (err) {
      console.error('Erro geral ao processar dados:', err);
      showToast('Falha na comunicação com o banco de dados.', 'error');
    } finally {
      tableSpinner.style.display = 'none';
    }
  }

  // ==========================================================================
  // Renderização da Tabela e Cálculo dos KPIs
  // ==========================================================================

  function renderFinancialsTable() {
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

    // 1. Atualiza KPIs Globais com base em todos os produtos ou filtrados
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

    // 2. Renderiza linhas da tabela
    financialsTableBody.innerHTML = '';

    if (filtered.length === 0) {
      tableEmptyMsg.style.display = 'block';
      return;
    }

    tableEmptyMsg.style.display = 'none';

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
            <a href="admin-produto.html?id=${item.id}" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto e insumos">
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

  // Listeners de filtro e busca
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderFinancialsTable();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      renderFinancialsTable();
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
