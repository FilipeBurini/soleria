/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Gestão de Lotes de Compra & Fornecedores Parceiros
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Guarda de rota autenticada
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const adminEmailElem = document.getElementById('admin-user-email');
  if (adminEmailElem) adminEmailElem.textContent = currentUser.email || 'Operador Autenticado';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);

  // Estados locais
  let allVendors = [];
  let allBatches = [];
  let allProducts = [];
  let allSupplies = [];

  // Elementos das Abas
  const tabBtnBatches = document.getElementById('tab-btn-batches');
  const tabBtnVendors = document.getElementById('tab-btn-vendors');
  const tabContentBatches = document.getElementById('tab-content-batches');
  const tabContentVendors = document.getElementById('tab-content-vendors');

  // KPIs
  const kpiVendorsCount = document.getElementById('kpi-vendors-count');
  const kpiBatchesCount = document.getElementById('kpi-batches-count');
  const kpiBatchesPendingInfo = document.getElementById('kpi-batches-pending-info');
  const kpiBatchesTotalCost = document.getElementById('kpi-batches-total-cost');
  const kpiBatchesItemsCount = document.getElementById('kpi-batches-items-count');

  // Lotes UI
  const searchBatchesInput = document.getElementById('search-batches-input');
  const filterBatchVendor = document.getElementById('filter-batch-vendor');
  const filterBatchStatus = document.getElementById('filter-batch-status');
  const batchesTbody = document.getElementById('batches-tbody');
  const batchesLoading = document.getElementById('batches-loading');
  const batchesEmpty = document.getElementById('batches-empty');

  // Fornecedores UI
  const searchVendorsInput = document.getElementById('search-vendors-input');
  const filterVendorCategory = document.getElementById('filter-vendor-category');
  const vendorsTbody = document.getElementById('vendors-tbody');
  const vendorsLoading = document.getElementById('vendors-loading');
  const vendorsEmpty = document.getElementById('vendors-empty');

  // Modais
  const modalVendor = document.getElementById('modal-vendor');
  const formVendor = document.getElementById('form-vendor');
  const modalVendorTitle = document.getElementById('modal-vendor-title');
  const vendorIdInput = document.getElementById('vendor-id');
  const vendorNameInput = document.getElementById('vendor-name');
  const vendorTradeNameInput = document.getElementById('vendor-trade-name');
  const vendorCategoryInput = document.getElementById('vendor-category');
  const vendorDocumentInput = document.getElementById('vendor-document');
  const vendorPhoneInput = document.getElementById('vendor-phone');
  const vendorEmailInput = document.getElementById('vendor-email');
  const vendorNotesInput = document.getElementById('vendor-notes');
  const btnCloseVendorModal = document.getElementById('btn-close-vendor-modal');
  const btnCancelVendor = document.getElementById('btn-cancel-vendor');
  const btnSaveVendor = document.getElementById('btn-save-vendor');

  const modalBatch = document.getElementById('modal-batch');
  const formBatch = document.getElementById('form-batch');
  const modalBatchTitle = document.getElementById('modal-batch-title');
  const batchIdInput = document.getElementById('batch-id');
  const batchCodeInput = document.getElementById('batch-code');
  const batchVendorSelect = document.getElementById('batch-vendor-id');
  const batchDateInput = document.getElementById('batch-date');
  const batchInvoiceInput = document.getElementById('batch-invoice');
  const batchStatusSelect = document.getElementById('batch-status');
  const batchShippingInput = document.getElementById('batch-shipping');
  const batchItemsContainer = document.getElementById('batch-items-container');
  const btnAddBatchItemRow = document.getElementById('btn-add-batch-item-row');
  const batchTotalDisplay = document.getElementById('batch-total-display');
  const batchUpdateStock = document.getElementById('batch-update-stock');
  const batchNotesInput = document.getElementById('batch-notes');
  const btnGenBatchCode = document.getElementById('btn-gen-batch-code');
  const btnCloseBatchModal = document.getElementById('btn-close-batch-modal');
  const btnCancelBatch = document.getElementById('btn-cancel-batch');
  const btnSaveBatch = document.getElementById('btn-save-batch');

  const modalBatchDetails = document.getElementById('modal-batch-details');
  const detailBatchCode = document.getElementById('detail-batch-code');
  const detailBatchStatus = document.getElementById('detail-batch-status');
  const detailBatchVendor = document.getElementById('detail-batch-vendor');
  const detailBatchDate = document.getElementById('detail-batch-date');
  const detailBatchInvoice = document.getElementById('detail-batch-invoice');
  const detailItemsTbody = document.getElementById('detail-items-tbody');
  const detailBatchShipping = document.getElementById('detail-batch-shipping');
  const detailBatchTotal = document.getElementById('detail-batch-total');
  const detailBatchNotes = document.getElementById('detail-batch-notes');
  const btnCloseDetailsModal = document.getElementById('btn-close-details-modal');
  const btnCloseDetails = document.getElementById('btn-close-details');

  // ==========================================================================
  // Controle de Abas
  // ==========================================================================
  function switchTab(tab) {
    if (tab === 'vendors') {
      tabBtnBatches.classList.remove('active');
      tabBtnVendors.classList.add('active');
      tabContentBatches.style.display = 'none';
      tabContentVendors.style.display = 'block';
    } else {
      tabBtnVendors.classList.remove('active');
      tabBtnBatches.classList.add('active');
      tabContentVendors.style.display = 'none';
      tabContentBatches.style.display = 'block';
    }
  }

  tabBtnBatches.addEventListener('click', () => switchTab('batches'));
  tabBtnVendors.addEventListener('click', () => switchTab('vendors'));

  // ==========================================================================
  // Carregamento Inicial de Dados
  // ==========================================================================
  async function loadAllData() {
    await Promise.all([
      fetchVendors(),
      fetchProductsAndSupplies(),
      fetchBatches()
    ]);
    updateKpis();
  }

  // Busca Fornecedores
  async function fetchVendors() {
    vendorsLoading.style.display = 'block';
    try {
      const { data, error } = await client
        .from('vendors')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        if (error.code === '42P01') {
          console.warn('Tabela vendors ainda não criada no Supabase.');
          showToast('Execute o script SQL "supabase_lotes_fornecedores.sql" no Supabase.', 'error', 6000);
        } else {
          console.warn('Erro ao carregar fornecedores:', error);
        }
        allVendors = [];
      } else {
        allVendors = data || [];
      }
    } catch (err) {
      console.warn('Erro de conexão ao buscar fornecedores:', err);
      allVendors = [];
    } finally {
      vendorsLoading.style.display = 'none';
      populateVendorDropdowns();
      renderVendorsTable();
    }
  }

  // Busca Produtos e Insumos para montar os itens do lote
  async function fetchProductsAndSupplies() {
    try {
      const [prodRes, suppRes] = await Promise.all([
        client.from('products').select('id, name, sku, product_cost, stock').order('name'),
        client.from('supplies').select('id, name, unit_cost, unit').order('name')
      ]);

      allProducts = prodRes.data || [];
      allSupplies = suppRes.data || [];
    } catch (e) {
      console.warn('Erro ao carregar catálogo para itens de lote:', e);
    }
  }

  // Busca Lotes de Compra com Itens vinculados
  async function fetchBatches() {
    batchesLoading.style.display = 'block';
    try {
      const { data, error } = await client
        .from('purchase_batches')
        .select(`
          *,
          vendor:vendors(id, name, trade_name),
          items:batch_items(*)
        `)
        .order('purchase_date', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          console.warn('Tabela purchase_batches ainda não criada no Supabase.');
        } else {
          console.warn('Erro ao carregar lotes de compra:', error);
        }
        allBatches = [];
      } else {
        allBatches = data || [];
      }
    } catch (err) {
      console.warn('Falha de conexão com lotes:', err);
      allBatches = [];
    } finally {
      batchesLoading.style.display = 'none';
      renderBatchesTable();
    }
  }

  // Preenche Dropdowns de Fornecedores
  function populateVendorDropdowns() {
    // Filtro da tabela de lotes
    filterBatchVendor.innerHTML = '<option value="">Todos os Fornecedores</option>';
    // Select do formulário de lote
    batchVendorSelect.innerHTML = '<option value="">Selecione o Fornecedor...</option>';

    allVendors.forEach(v => {
      const label = v.trade_name ? `${v.name} (${v.trade_name})` : v.name;
      
      const optFilter = document.createElement('option');
      optFilter.value = v.id;
      optFilter.textContent = label;
      filterBatchVendor.appendChild(optFilter);

      const optForm = document.createElement('option');
      optForm.value = v.id;
      optForm.textContent = label;
      batchVendorSelect.appendChild(optForm);
    });

    populateVendorCategorySuggestions();
  }

  // Preenche opções de categorias únicas no filtro e no datalist do formulário
  function populateVendorCategorySuggestions() {
    const categoriesSet = new Set(['Joias & Ouro', 'Prata 925', 'Banhos & Galvanoplastia', 'Embalagens & Estojos', 'Pedras & Gemas', 'Fundição & Moldes', 'Gravação a Laser', 'Geral']);
    
    allVendors.forEach(v => {
      if (v.category && v.category.trim()) {
        categoriesSet.add(v.category.trim());
      }
    });

    // Atualiza filtro select da tabela
    if (filterVendorCategory) {
      const currentSelected = filterVendorCategory.value;
      filterVendorCategory.innerHTML = '<option value="">Todas as Categorias</option>';
      Array.from(categoriesSet).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (currentSelected === cat) opt.selected = true;
        filterVendorCategory.appendChild(opt);
      });
    }

    // Atualiza sugestões no datalist do modal
    const datalist = document.getElementById('vendor-category-suggestions');
    if (datalist) {
      datalist.innerHTML = '';
      Array.from(categoriesSet).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        datalist.appendChild(opt);
      });
    }
  }

  // ==========================================================================
  // Renderização: Tabela de Fornecedores
  // ==========================================================================
  function renderVendorsTable() {
    const q = (searchVendorsInput.value || '').trim().toLowerCase();
    const cat = filterVendorCategory.value;

    const filtered = allVendors.filter(v => {
      const matchQuery = !q ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.trade_name && v.trade_name.toLowerCase().includes(q)) ||
        (v.document && v.document.includes(q)) ||
        (v.phone && v.phone.includes(q));

      const matchCat = !cat || v.category === cat;
      return matchQuery && matchCat;
    });

    const vendorsCountBadge = document.getElementById('vendors-count-badge');
    if (vendorsCountBadge) {
      vendorsCountBadge.textContent = `${filtered.length} fornecedor(es) exibido(s)`;
    }

    vendorsTbody.innerHTML = '';

    if (filtered.length === 0) {
      vendorsEmpty.style.display = 'block';
      return;
    }

    vendorsEmpty.style.display = 'none';

    filtered.forEach(v => {
      const batchesCount = allBatches.filter(b => b.vendor_id === v.id).length;
      const cleanPhone = v.phone ? v.phone.replace(/\D/g, '') : '';
      const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem;">${v.name}</div>
          ${v.document ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace; margin-top: 0.2rem;">Doc: ${v.document}</div>` : ''}
        </td>
        <td style="font-weight: 500; color: var(--text-secondary);">${v.trade_name || '<span style="color: var(--text-muted);">—</span>'}</td>
        <td><span class="badge-category">${v.category || 'Geral'}</span></td>
        <td>
          ${v.phone ? `
            <a href="${waLink || '#'}" target="_blank" class="wa-btn-badge" title="Abrir conversa no WhatsApp">
              <span>💬</span> ${v.phone}
            </a>
          ` : '<span style="color: var(--text-muted);">—</span>'}
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${v.email || '<span style="color: var(--text-muted);">—</span>'}</td>
        <td style="text-align: center;"><span style="font-weight: 700; color: var(--brand-terracotta); background: #FAF5F0; padding: 0.2rem 0.55rem; border-radius: var(--radius-sm); border: 1px solid #F5EAE0;">${batchesCount}</span></td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.4rem; justify-content: center;">
            <button type="button" class="btn-secondary-action btn-edit-vendor" data-id="${v.id}" style="padding: 0.3rem 0.65rem; font-size: 0.74rem;" title="Editar Fornecedor">
              Editar
            </button>
            <button type="button" class="btn-secondary-action btn-del-vendor" data-id="${v.id}" style="padding: 0.3rem 0.65rem; font-size: 0.74rem; color: #DC2626; border-color: #FCA5A5;" title="Excluir Fornecedor">
              Excluir
            </button>
          </div>
        </td>
      `;

      vendorsTbody.appendChild(tr);
    });

    // Eventos de Editar e Excluir Fornecedor
    document.querySelectorAll('.btn-edit-vendor').forEach(b => {
      b.addEventListener('click', () => openEditVendorModal(b.dataset.id));
    });
    document.querySelectorAll('.btn-del-vendor').forEach(b => {
      b.addEventListener('click', () => deleteVendor(b.dataset.id));
    });
  }

  // ==========================================================================
  // Renderização: Tabela de Lotes de Compra
  // ==========================================================================
  function renderBatchesTable() {
    const q = (searchBatchesInput.value || '').trim().toLowerCase();
    const vendorFilter = filterBatchVendor.value;
    const statusFilter = filterBatchStatus.value;

    const filtered = allBatches.filter(b => {
      const matchQ = !q ||
        (b.batch_code && b.batch_code.toLowerCase().includes(q)) ||
        (b.invoice_number && b.invoice_number.toLowerCase().includes(q)) ||
        (b.notes && b.notes.toLowerCase().includes(q));

      const matchVendor = !vendorFilter || b.vendor_id === vendorFilter;
      const matchStatus = !statusFilter || b.status === statusFilter;

      return matchQ && matchVendor && matchStatus;
    });

    const batchesCountBadge = document.getElementById('batches-count-badge');
    if (batchesCountBadge) {
      batchesCountBadge.textContent = `${filtered.length} lote(s) exibido(s)`;
    }

    batchesTbody.innerHTML = '';

    if (filtered.length === 0) {
      batchesEmpty.style.display = 'block';
      return;
    }

    batchesEmpty.style.display = 'none';

    filtered.forEach(b => {
      const vendorName = b.vendor?.trade_name || b.vendor?.name || 'Não informado';
      const itemsCount = Array.isArray(b.items) ? b.items.length : 0;

      // Status Badge
      let statusColor = '#3B82F6';
      let statusBg = '#EFF6FF';
      let statusLabel = 'Recebido';

      if (b.status === 'pendente') {
        statusColor = '#D97706';
        statusBg = '#FFFBEB';
        statusLabel = 'Pendente';
      } else if (b.status === 'em_transito') {
        statusColor = '#8B5CF6';
        statusBg = '#F5F3FF';
        statusLabel = 'Em Trânsito';
      } else if (b.status === 'concluido') {
        statusColor = '#059669';
        statusBg = '#ECFDF5';
        statusLabel = 'Concluído';
      }

      const formattedDate = b.purchase_date
        ? new Date(b.purchase_date + 'T12:00:00Z').toLocaleDateString('pt-BR')
        : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span style="font-family: monospace; font-weight: 700; color: var(--brand-terracotta); background: #FAF5F0; padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid #F5EAE0; display: inline-block;">
            ${b.batch_code}
          </span>
        </td>
        <td style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem;">${vendorName}</td>
        <td style="color: var(--text-secondary);">${formattedDate}</td>
        <td>${b.invoice_number ? `<span style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary);">${b.invoice_number}</span>` : '<span style="color: var(--text-muted);">—</span>'}</td>
        <td style="text-align: center;"><span style="font-weight: 700; color: var(--text-primary);">${itemsCount}</span></td>
        <td style="text-align: right; font-weight: 700; color: var(--brand-terracotta); font-family: monospace; font-size: 0.92rem;">${formatBRL(b.total_cost || 0)}</td>
        <td style="text-align: center;">
          <span style="display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.22rem 0.6rem; border-radius: 999px; background: ${statusBg}; color: ${statusColor}; white-space: nowrap;">
            ${statusLabel}
          </span>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.4rem; justify-content: center;">
            <button type="button" class="btn-secondary-action btn-view-batch" data-id="${b.id}" style="padding: 0.3rem 0.65rem; font-size: 0.74rem;" title="Ver Detalhes dos Itens">
              🔍 Ver Itens
            </button>
            <button type="button" class="btn-secondary-action btn-del-batch" data-id="${b.id}" style="padding: 0.3rem 0.65rem; font-size: 0.74rem; color: #DC2626; border-color: #FCA5A5;" title="Excluir Lote">
              Excluir
            </button>
          </div>
        </td>
      `;

      batchesTbody.appendChild(tr);
    });

    // Eventos de visualização e exclusão de lotes
    document.querySelectorAll('.btn-view-batch').forEach(b => {
      b.addEventListener('click', () => openBatchDetailsModal(b.dataset.id));
    });
    document.querySelectorAll('.btn-del-batch').forEach(b => {
      b.addEventListener('click', () => deleteBatch(b.dataset.id));
    });
  }

  // ==========================================================================
  // Atualização dos Indicadores (KPIs)
  // ==========================================================================
  function updateKpis() {
    if (kpiVendorsCount) kpiVendorsCount.textContent = allVendors.length;
    if (kpiBatchesCount) kpiBatchesCount.textContent = allBatches.length;

    const pending = allBatches.filter(b => b.status === 'pendente' || b.status === 'em_transito').length;
    if (kpiBatchesPendingInfo) {
      kpiBatchesPendingInfo.textContent = `${pending} pendente(s) de recebimento`;
    }

    const totalInvested = allBatches.reduce((acc, b) => acc + Number(b.total_cost || 0), 0);
    if (kpiBatchesTotalCost) kpiBatchesTotalCost.textContent = formatBRL(totalInvested);

    let totalItems = 0;
    allBatches.forEach(b => {
      if (Array.isArray(b.items)) {
        b.items.forEach(it => totalItems += Number(it.quantity || 0));
      }
    });
    if (kpiBatchesItemsCount) kpiBatchesItemsCount.textContent = `${totalItems} unidades compradas`;
  }

  // Filtros em tempo real
  searchBatchesInput.addEventListener('input', renderBatchesTable);
  filterBatchVendor.addEventListener('change', renderBatchesTable);
  filterBatchStatus.addEventListener('change', renderBatchesTable);

  searchVendorsInput.addEventListener('input', renderVendorsTable);
  filterVendorCategory.addEventListener('change', renderVendorsTable);

  // ==========================================================================
  // MODAL: FORNECEDOR (Criar / Editar)
  // ==========================================================================
  function openVendorModal() {
    modalVendor.classList.add('active');
  }

  function closeVendorModal() {
    modalVendor.classList.remove('active');
  }

  document.getElementById('btn-open-new-vendor').addEventListener('click', () => {
    formVendor.reset();
    vendorIdInput.value = '';
    modalVendorTitle.textContent = 'Novo Fornecedor Parceiro';
    openVendorModal();
  });

  function openEditVendorModal(id) {
    const v = allVendors.find(x => x.id === id);
    if (!v) return;

    vendorIdInput.value = v.id;
    vendorNameInput.value = v.name || '';
    vendorTradeNameInput.value = v.trade_name || '';
    vendorCategoryInput.value = v.category || 'Geral';
    vendorDocumentInput.value = v.document || '';
    vendorPhoneInput.value = v.phone || '';
    vendorEmailInput.value = v.email || '';
    vendorNotesInput.value = v.notes || '';

    modalVendorTitle.textContent = 'Editar Fornecedor';
    openVendorModal();
  }

  btnCloseVendorModal.addEventListener('click', closeVendorModal);
  btnCancelVendor.addEventListener('click', closeVendorModal);
  modalVendor.addEventListener('click', (e) => {
    if (e.target === modalVendor) closeVendorModal();
  });

  formVendor.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEdit = Boolean(vendorIdInput.value);
    const payload = {
      name: vendorNameInput.value.trim(),
      trade_name: vendorTradeNameInput.value.trim() || null,
      category: vendorCategoryInput.value.trim() || 'Geral',
      document: vendorDocumentInput.value.trim() || null,
      phone: vendorPhoneInput.value.trim() || null,
      email: vendorEmailInput.value.trim() || null,
      notes: vendorNotesInput.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    btnSaveVendor.disabled = true;
    btnSaveVendor.textContent = 'Salvando...';

    try {
      if (isEdit) {
        const { error } = await client.from('vendors').update(payload).eq('id', vendorIdInput.value);
        if (error) throw error;
        showToast('Fornecedor atualizado com sucesso!', 'success');
      } else {
        const { error } = await client.from('vendors').insert([payload]);
        if (error) throw error;
        showToast('Fornecedor cadastrado com sucesso!', 'success');
      }

      closeVendorModal();
      await fetchVendors();
      updateKpis();
    } catch (err) {
      console.error('Erro ao salvar fornecedor:', err);
      showToast('Erro ao salvar fornecedor: ' + err.message, 'error', 5000);
    } finally {
      btnSaveVendor.disabled = false;
      btnSaveVendor.textContent = 'Salvar Fornecedor';
    }
  });

  async function deleteVendor(id) {
    const v = allVendors.find(x => x.id === id);
    if (!v) return;

    if (!confirm(`Deseja realmente excluir o fornecedor "${v.name}"?`)) return;

    try {
      const { error } = await client.from('vendors').delete().eq('id', id);
      if (error) throw error;
      showToast('Fornecedor excluído com sucesso.', 'success');
      await fetchVendors();
      updateKpis();
    } catch (err) {
      console.error('Erro ao excluir fornecedor:', err);
      showToast('Erro ao excluir: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // MODAL: LOTE DE COMPRA (Grade Dinâmica de Itens)
  // ==========================================================================
  function openBatchModal() {
    modalBatch.classList.add('active');
  }

  function closeBatchModal() {
    modalBatch.classList.remove('active');
  }

  document.getElementById('btn-open-new-batch').addEventListener('click', () => {
    formBatch.reset();
    batchIdInput.value = '';
    batchDateInput.value = new Date().toISOString().split('T')[0];
    batchItemsContainer.innerHTML = '';
    generateNextBatchCode();
    modalBatchTitle.textContent = 'Entrada de Lote de Compra';
    openBatchModal();
    // Adiciona uma linha em branco por padrão
    addBatchItemRow();
    recalcBatchTotal();
  });

  btnCloseBatchModal.addEventListener('click', closeBatchModal);
  btnCancelBatch.addEventListener('click', closeBatchModal);
  modalBatch.addEventListener('click', (e) => {
    if (e.target === modalBatch) closeBatchModal();
  });

  // Gerador automático de código de lote sequencial (ex: LOT-2026-001)
  function generateNextBatchCode() {
    const currentYear = new Date().getFullYear();
    const count = allBatches.length + 1;
    const code = `LOT-${currentYear}-${String(count).padStart(3, '0')}`;
    batchCodeInput.value = code;
  }

  if (btnGenBatchCode) {
    btnGenBatchCode.addEventListener('click', generateNextBatchCode);
  }

  // Adiciona Linha de Item no Lote
  function addBatchItemRow(itemData = null) {
    const row = document.createElement('div');
    row.className = 'item-row';

    row.innerHTML = `
      <div>
        <select class="form-select row-item-type" style="font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
          <option value="produto" ${itemData?.item_type === 'produto' ? 'selected' : ''}>Joia / Produto</option>
          <option value="insumo" ${itemData?.item_type === 'insumo' ? 'selected' : ''}>Insumo / Matéria</option>
        </select>
      </div>
      <div>
        <select class="form-select row-item-select" style="font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
          <option value="">Selecione o item...</option>
        </select>
      </div>
      <div>
        <input type="number" min="0.01" step="any" class="form-input row-item-qty" value="${itemData?.quantity ?? 1}" style="font-size: 0.85rem; height: 38px; text-align: center; font-weight: 600;">
      </div>
      <div>
        <input type="number" min="0" step="0.01" class="form-input row-item-cost" placeholder="0.00" value="${itemData?.unit_cost ?? ''}" style="font-size: 0.85rem; height: 38px; text-align: right; font-weight: 500;">
      </div>
      <div style="text-align: right; font-weight: 700; font-size: 0.88rem; font-family: monospace; color: var(--brand-terracotta);" class="row-item-subtotal">
        R$ 0,00
      </div>
      <div style="display: flex; justify-content: center;">
        <button type="button" class="btn-remove-row" title="Remover item">&times;</button>
      </div>
    `;

    batchItemsContainer.appendChild(row);

    const typeSelect = row.querySelector('.row-item-type');
    const itemSelect = row.querySelector('.row-item-select');
    const qtyInput = row.querySelector('.row-item-qty');
    const costInput = row.querySelector('.row-item-cost');
    const subtotalDisplay = row.querySelector('.row-item-subtotal');
    const removeBtn = row.querySelector('.btn-remove-row');

    function populateSelectByType() {
      const type = typeSelect.value;
      itemSelect.innerHTML = '<option value="">Selecione o item...</option>';

      if (type === 'produto') {
        allProducts.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.sku ? `[${p.sku}] ` : ''}${p.name}`;
          opt.dataset.cost = p.product_cost || 0;
          if (itemData?.product_id === p.id) opt.selected = true;
          itemSelect.appendChild(opt);
        });
      } else {
        allSupplies.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name} (${s.unit || 'un'})`;
          opt.dataset.cost = s.unit_cost || 0;
          if (itemData?.supply_id === s.id) opt.selected = true;
          itemSelect.appendChild(opt);
        });
      }
    }

    populateSelectByType();

    typeSelect.addEventListener('change', () => {
      populateSelectByType();
      recalcRow();
    });

    itemSelect.addEventListener('change', () => {
      const selectedOpt = itemSelect.options[itemSelect.selectedIndex];
      if (selectedOpt && selectedOpt.dataset.cost && !costInput.value) {
        costInput.value = parseFloat(selectedOpt.dataset.cost).toFixed(2);
      }
      recalcRow();
    });

    function recalcRow() {
      const q = parseFloat(qtyInput.value) || 0;
      const c = parseFloat(costInput.value) || 0;
      const sub = q * c;
      subtotalDisplay.textContent = formatBRL(sub);
      recalcBatchTotal();
    }

    qtyInput.addEventListener('input', recalcRow);
    costInput.addEventListener('input', recalcRow);

    removeBtn.addEventListener('click', () => {
      row.remove();
      recalcBatchTotal();
    });

    recalcRow();
  }

  btnAddBatchItemRow.addEventListener('click', () => addBatchItemRow());

  // Recalcula o total geral do lote
  function recalcBatchTotal() {
    let itemsTotal = 0;
    const rows = batchItemsContainer.querySelectorAll('.item-row');

    rows.forEach(r => {
      const q = parseFloat(r.querySelector('.row-item-qty').value) || 0;
      const c = parseFloat(r.querySelector('.row-item-cost').value) || 0;
      itemsTotal += (q * c);
    });

    const shipping = parseFloat(batchShippingInput.value) || 0;
    const grandTotal = itemsTotal + shipping;

    batchTotalDisplay.textContent = formatBRL(grandTotal);
  }

  batchShippingInput.addEventListener('input', recalcBatchTotal);

  // Submissão do Formulário de Lote
  formBatch.addEventListener('submit', async (e) => {
    e.preventDefault();

    const vendorId = batchVendorSelect.value;
    const batchCode = batchCodeInput.value.trim().toUpperCase();

    if (!vendorId) {
      showToast('Selecione o fornecedor deste lote.', 'error');
      return;
    }

    // Coleta itens da grade
    const rows = batchItemsContainer.querySelectorAll('.item-row');
    const items = [];

    rows.forEach(r => {
      const type = r.querySelector('.row-item-type').value;
      const select = r.querySelector('.row-item-select');
      const selectedId = select.value;
      const selectedText = select.options[select.selectedIndex]?.textContent || 'Item sem nome';
      const qty = parseFloat(r.querySelector('.row-item-qty').value) || 0;
      const cost = parseFloat(r.querySelector('.row-item-cost').value) || 0;

      if (selectedId && qty > 0) {
        items.push({
          item_type: type,
          product_id: type === 'produto' ? selectedId : null,
          supply_id: type === 'insumo' ? selectedId : null,
          item_name: selectedText,
          quantity: qty,
          unit_cost: cost
        });
      }
    });

    if (items.length === 0) {
      showToast('Adicione pelo menos um item ao lote com quantidade maior que zero.', 'error');
      return;
    }

    const shipping = parseFloat(batchShippingInput.value) || 0;
    const itemsTotal = items.reduce((acc, it) => acc + (it.quantity * it.unit_cost), 0);
    const totalCost = itemsTotal + shipping;

    const batchPayload = {
      batch_code: batchCode,
      vendor_id: vendorId,
      purchase_date: batchDateInput.value,
      invoice_number: batchInvoiceInput.value.trim() || null,
      status: batchStatusSelect.value,
      shipping_cost: shipping,
      total_cost: totalCost,
      notes: batchNotesInput.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    btnSaveBatch.disabled = true;
    btnSaveBatch.textContent = 'Salvando lote...';

    try {
      // 1. Insere o Lote
      const { data: createdBatch, error: batchErr } = await client
        .from('purchase_batches')
        .insert([batchPayload])
        .select()
        .single();

      if (batchErr) throw batchErr;

      // 2. Insere os Itens do Lote
      const batchItemsPayload = items.map(it => ({
        batch_id: createdBatch.id,
        item_type: it.item_type,
        product_id: it.product_id,
        supply_id: it.supply_id,
        item_name: it.item_name,
        quantity: it.quantity,
        unit_cost: it.unit_cost
      }));

      const { error: itemsErr } = await client
        .from('batch_items')
        .insert(batchItemsPayload);

      if (itemsErr) {
        console.warn('Aviso ao inserir itens do lote:', itemsErr);
      }

      // 3. Atualiza o fornecedor e lote de origem nos produtos e insumos vinculados
      for (const it of items) {
        if (it.product_id) {
          try {
            await client.from('products').update({
              vendor_id: vendorId,
              batch_id: createdBatch.id
            }).eq('id', it.product_id);
          } catch (e) {}

          // Se marcou para incrementar o estoque das peças
          if (batchUpdateStock.checked) {
            try {
              const currentProd = allProducts.find(p => p.id === it.product_id);
              if (currentProd) {
                const newStock = (parseInt(currentProd.stock, 10) || 0) + parseInt(it.quantity, 10);
                await client.from('products').update({ stock: newStock }).eq('id', it.product_id);
              }
            } catch (stockErr) {
              console.warn('Aviso ao atualizar estoque:', stockErr);
            }
          }
        } else if (it.supply_id) {
          try {
            await client.from('supplies').update({
              vendor_id: vendorId,
              batch_id: createdBatch.id
            }).eq('id', it.supply_id);
          } catch (e) {}
        }
      }

      showToast(`Lote ${batchCode} registrado com sucesso!`, 'success');
      closeBatchModal();
      await fetchBatches();
      await fetchProductsAndSupplies();
      updateKpis();

    } catch (err) {
      console.error('Erro ao salvar lote de compra:', err);
      showToast('Erro ao salvar lote: ' + err.message, 'error', 6000);
    } finally {
      btnSaveBatch.disabled = false;
      btnSaveBatch.textContent = 'Salvar Entrada de Lote';
    }
  });

  // Exclusão de Lote
  async function deleteBatch(id) {
    const b = allBatches.find(x => x.id === id);
    if (!b) return;

    if (!confirm(`Deseja realmente excluir o lote "${b.batch_code}"? Todos os itens vinculados a ele serão desvinculados.`)) return;

    try {
      const { error } = await client.from('purchase_batches').delete().eq('id', id);
      if (error) throw error;
      showToast(`Lote ${b.batch_code} excluído com sucesso.`, 'success');
      await fetchBatches();
      updateKpis();
    } catch (err) {
      console.error('Erro ao excluir lote:', err);
      showToast('Erro ao excluir lote: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // MODAL: VISUALIZAR DETALHES DO LOTE
  // ==========================================================================
  function openBatchDetailsModal(id) {
    const b = allBatches.find(x => x.id === id);
    if (!b) return;

    detailBatchCode.textContent = b.batch_code;
    detailBatchStatus.textContent = (b.status || 'recebido').toUpperCase();
    detailBatchVendor.textContent = `Fornecedor: ${b.vendor?.trade_name || b.vendor?.name || 'Não informado'}`;
    detailBatchDate.textContent = `Data: ${b.purchase_date ? new Date(b.purchase_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '—'}`;
    detailBatchInvoice.textContent = `NF / Recibo: ${b.invoice_number || 'Não informado'}`;
    detailBatchShipping.textContent = formatBRL(b.shipping_cost || 0);
    detailBatchTotal.textContent = formatBRL(b.total_cost || 0);
    detailBatchNotes.textContent = b.notes ? `Obs: "${b.notes}"` : '';

    detailItemsTbody.innerHTML = '';
    const items = Array.isArray(b.items) ? b.items : [];

    if (items.length === 0) {
      detailItemsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum item listado neste lote.</td></tr>`;
    } else {
      items.forEach(it => {
        const sub = (it.quantity || 1) * (it.unit_cost || 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="badge-category">${it.item_type === 'produto' ? 'Joia' : 'Insumo'}</span></td>
          <td style="font-weight: 500;">${it.item_name}</td>
          <td style="text-align: center;">${it.quantity}</td>
          <td style="text-align: right;">${formatBRL(it.unit_cost)}</td>
          <td style="text-align: right; font-weight: 600;">${formatBRL(sub)}</td>
        `;
        detailItemsTbody.appendChild(tr);
      });
    }

    modalBatchDetails.classList.add('active');
  }

  function closeDetailsModal() {
    modalBatchDetails.classList.remove('active');
  }

  btnCloseDetailsModal.addEventListener('click', closeDetailsModal);
  btnCloseDetails.addEventListener('click', closeDetailsModal);
  modalBatchDetails.addEventListener('click', (e) => {
    if (e.target === modalBatchDetails) closeDetailsModal();
  });

  // Inicializa tudo
  await loadAllData();
});
