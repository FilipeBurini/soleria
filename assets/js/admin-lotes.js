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
  const detailBatchShipping = document.getElementById('detail-batch-shipping');
  const detailBatchTotal = document.getElementById('detail-batch-total');
  const detailBatchNotes = document.getElementById('detail-batch-notes');
  const btnCloseDetailsModal = document.getElementById('btn-close-details-modal');
  const btnCloseDetails = document.getElementById('btn-close-details');
  const btnDetailViewVisual = document.getElementById('btn-detail-view-visual');
  const btnDetailViewTable = document.getElementById('btn-detail-view-table');
  const detailVisualGrid = document.getElementById('detail-visual-grid');
  const detailTableContainer = document.getElementById('detail-table-container');
  const detailItemsTbody = document.getElementById('detail-items-tbody');
  const detailEmptyState = document.getElementById('detail-empty-state');
  const detailItemsCountBadge = document.getElementById('detail-items-count-badge');
  const detailTotalPiecesCount = document.getElementById('detail-total-pieces-count');
  const detailSearchItems = document.getElementById('detail-search-items');
  const btnOpenAddItemModal = document.getElementById('btn-open-add-item-modal');

  // Modal de inclusão de item no lote
  const modalAddItemToBatch = document.getElementById('modal-add-item-to-batch');
  const formAddBatchItem = document.getElementById('form-add-batch-item');
  const addItemModalSubtitle = document.getElementById('add-item-modal-subtitle');
  const addItemType = document.getElementById('add-item-type');
  const addItemSelect = document.getElementById('add-item-select');
  const addItemQty = document.getElementById('add-item-qty');
  const addItemCost = document.getElementById('add-item-cost');
  const addItemSyncStock = document.getElementById('add-item-sync-stock');
  const addItemRingSizesBox = document.getElementById('add-item-ring-sizes-box');
  const addItemRingGrid = document.getElementById('add-item-ring-grid');
  const addItemRingTotalBadge = document.getElementById('add-item-ring-total-badge');
  const addItemPreviewCard = document.getElementById('add-item-preview-card');
  const addItemPreviewImg = document.getElementById('add-item-preview-img');
  const addItemPreviewSku = document.getElementById('add-item-preview-sku');
  const addItemPreviewName = document.getElementById('add-item-preview-name');
  const addItemPreviewCategory = document.getElementById('add-item-preview-category');
  const btnCloseAddItemModal = document.getElementById('btn-close-add-item-modal');
  const btnCancelAddItem = document.getElementById('btn-cancel-add-item');
  const btnSaveBatchItem = document.getElementById('btn-save-batch-item');

  let currentDetailBatchId = null;
  let activeDetailView = 'visual'; // 'visual' | 'table'

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
    await fetchVendors();
    await fetchProductsAndSupplies();
    await fetchBatches();
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
        client.from('products').select('id, name, sku, category, product_cost, sale_price, stock, images, sizes, batch_id').order('name'),
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
        const rawBatches = data || [];

        // Auto-sincronização de peças vinculadas via catálogo que ainda não tinham batch_items gerado
        if (rawBatches.length > 0 && allProducts.length > 0) {
          for (const b of rawBatches) {
            b.items = Array.isArray(b.items) ? b.items : [];
            const linkedProds = allProducts.filter(p => p.batch_id === b.id);
            for (const p of linkedProds) {
              const alreadyInBatch = b.items.some(it => it.product_id === p.id);
              if (!alreadyInBatch) {
                const ringNotes = p.sizes && Object.keys(p.sizes).length > 0 ? JSON.stringify({ sizes: p.sizes }) : null;
                const newItemPayload = {
                  batch_id: b.id,
                  product_id: p.id,
                  item_type: 'produto',
                  item_name: `[${p.sku || 'SEM-SKU'}] ${p.name || 'Joia'}`,
                  quantity: Number(p.stock) || 1,
                  unit_cost: Number(p.product_cost) || 0,
                  notes: ringNotes
                };
                try {
                  const { data: insertedItem } = await client.from('batch_items').insert([newItemPayload]).select().single();
                  if (insertedItem) {
                    b.items.push(insertedItem);
                  } else {
                    b.items.push(newItemPayload);
                  }
                } catch (e) {
                  b.items.push(newItemPayload);
                }
              }
            }
            // Recalcula total_cost do lote em memória
            const itemsSum = b.items.reduce((acc, it) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)), 0);
            const shipping = Number(b.shipping_cost) || 0;
            b.total_cost = itemsSum + shipping;
          }
        }

        allBatches = rawBatches;
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

  function renderBatchItemsContainerPlaceholder() {
    batchItemsContainer.innerHTML = `
      <div id="batch-items-empty-hint" style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 1.5rem 1rem; font-style: italic; background: #FAF8F5; border-radius: var(--radius-sm); border: 1px dashed #E5E7EB;">
        Nenhum item adicionado ainda. Você pode salvar este lote sem itens agora e vinculá-los depois pelo catálogo ou pelos detalhes do lote!
      </div>
    `;
  }

  document.getElementById('btn-open-new-batch').addEventListener('click', () => {
    formBatch.reset();
    batchIdInput.value = '';
    batchDateInput.value = new Date().toISOString().split('T')[0];
    generateNextBatchCode();
    modalBatchTitle.textContent = 'Entrada de Lote de Compra';
    openBatchModal();
    renderBatchItemsContainerPlaceholder();
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
    const hint = document.getElementById('batch-items-empty-hint');
    if (hint) hint.remove();

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

      // 2. Insere os Itens do Lote (se houver)
      if (items.length > 0) {
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
  // MODAL: VISUALIZAR DETALHES DO LOTE (ESTILO ESTOQUE)
  // ==========================================================================
  function openBatchDetailsModal(id) {
    const b = allBatches.find(x => x.id === id);
    if (!b) return;

    currentDetailBatchId = id;

    detailBatchCode.textContent = b.batch_code;
    detailBatchStatus.textContent = (b.status || 'recebido').toUpperCase();
    detailBatchVendor.innerHTML = `🏢 Fornecedor: <strong>${b.vendor?.trade_name || b.vendor?.name || 'Não informado'}</strong>`;
    detailBatchDate.innerHTML = `📅 Data: <strong>${b.purchase_date ? new Date(b.purchase_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '—'}</strong>`;
    detailBatchInvoice.innerHTML = `📄 NF: <strong>${b.invoice_number || 'Não informado'}</strong>`;
    detailBatchShipping.textContent = formatBRL(b.shipping_cost || 0);
    detailBatchTotal.textContent = formatBRL(b.total_cost || 0);
    detailBatchNotes.textContent = b.notes ? `Obs: "${b.notes}"` : '';

    if (detailSearchItems) detailSearchItems.value = '';

    renderBatchDetailsContent(b);
    modalBatchDetails.classList.add('active');
  }

  function renderBatchDetailsContent(b) {
    if (!b) return;

    const query = (detailSearchItems?.value || '').trim().toLowerCase();
    const rawItems = Array.isArray(b.items) ? b.items : [];

    const items = rawItems.filter(it => {
      if (!query) return true;
      const nameMatch = it.item_name && it.item_name.toLowerCase().includes(query);
      const prod = allProducts.find(p => p.id === it.product_id);
      const skuMatch = prod?.sku && prod.sku.toLowerCase().includes(query);
      return nameMatch || skuMatch;
    });

    const totalPieces = rawItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    if (detailItemsCountBadge) detailItemsCountBadge.textContent = `${rawItems.length} item(ns)`;
    if (detailTotalPiecesCount) detailTotalPiecesCount.textContent = `${totalPieces} un`;

    if (rawItems.length === 0) {
      if (detailEmptyState) detailEmptyState.style.display = 'block';
      if (detailVisualGrid) detailVisualGrid.style.display = 'none';
      if (detailTableContainer) detailTableContainer.style.display = 'none';
      return;
    }

    if (detailEmptyState) detailEmptyState.style.display = 'none';

    // Aplica visibilidade baseada no alternador
    if (activeDetailView === 'table') {
      if (detailVisualGrid) detailVisualGrid.style.display = 'none';
      if (detailTableContainer) detailTableContainer.style.display = 'block';
    } else {
      if (detailVisualGrid) detailVisualGrid.style.display = 'grid';
      if (detailTableContainer) detailTableContainer.style.display = 'none';
    }

    // 1. Renderiza Vitrine Visual (Cards no Estilo Estoque)
    if (detailVisualGrid) {
      detailVisualGrid.innerHTML = '';
      items.forEach(it => {
        const prod = allProducts.find(p => p.id === it.product_id);
        const isSupply = it.item_type === 'insumo';

        // Imagem da joia
        let imgUrl = 'assets/images/logo-simbolo.png';
        if (prod && prod.images) {
          let imgs = prod.images;
          if (typeof imgs === 'string') {
            try { imgs = JSON.parse(imgs); } catch(e) { imgs = []; }
          }
          if (Array.isArray(imgs) && imgs.length > 0) {
            imgUrl = imgs[0];
          }
        }

        // Aros do Lote
        let ringChipsHtml = '';
        let isRing = false;

        if (it.notes) {
          try {
            const parsed = JSON.parse(it.notes);
            if (parsed && parsed.sizes && typeof parsed.sizes === 'object') {
              isRing = true;
              const entries = Object.entries(parsed.sizes).filter(([_, q]) => Number(q) > 0).sort((a,b) => Number(a[0]) - Number(b[0]));
              if (entries.length > 0) {
                ringChipsHtml = entries.map(([aro, qty]) => `
                  <span class="admin-aro-chip" style="cursor: default; font-size: 0.72rem; padding: 0.2rem 0.5rem;" title="${qty} un deste aro neste lote">
                    Aro ${aro} <strong>(${qty})</strong>
                  </span>
                `).join('');
              }
            }
          } catch(e) {
            if (typeof it.notes === 'string' && it.notes.includes('Aro')) {
              isRing = true;
              ringChipsHtml = `<span style="font-size: 0.74rem; color: var(--text-secondary);">${it.notes}</span>`;
            }
          }
        }

        if (!ringChipsHtml && prod && prod.sizes) {
          let pSizes = prod.sizes;
          if (typeof pSizes === 'string') {
            try { pSizes = JSON.parse(pSizes); } catch(e) { pSizes = {}; }
          }
          const entries = Object.entries(pSizes).filter(([_, q]) => Number(q) > 0).sort((a,b) => Number(a[0]) - Number(b[0]));
          if (entries.length > 0) {
            isRing = true;
            ringChipsHtml = entries.map(([aro, qty]) => `
              <span class="admin-aro-chip" style="cursor: default; font-size: 0.72rem; padding: 0.2rem 0.5rem;" title="${qty} un deste aro">
                Aro ${aro} <strong>(${qty})</strong>
              </span>
            `).join('');
          }
        }

        const subtotal = (Number(it.quantity) || 1) * (Number(it.unit_cost) || 0);

        const card = document.createElement('div');
        card.className = 'admin-visual-card';
        card.innerHTML = `
          <div class="admin-visual-top">
            <img src="${imgUrl}" alt="${it.item_name}" class="admin-visual-img" loading="lazy" onerror="this.src='assets/images/logo-simbolo.png'">
            <div class="admin-visual-meta">
              <span class="admin-visual-sku">${prod?.sku || (isSupply ? 'INSUMO' : 'JOIA')}</span>
              <div class="admin-visual-name" title="${it.item_name}">${it.item_name}</div>
              <span class="admin-visual-price" style="font-size: 0.76rem; color: var(--text-muted);">
                ${isSupply ? 'Insumo de produção' : (prod?.category || 'Semijoia')}
              </span>
            </div>
          </div>

          <div class="admin-visual-body">
            <div class="admin-visual-stock-row">
              <span style="font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;">
                Qtd Recebida no Lote
              </span>
              <span class="admin-visual-stock-badge has-stock" style="background: #FAF5F0; color: var(--brand-terracotta); border: 1px solid #F5EAE0;">
                ${it.quantity} un
              </span>
            </div>

            ${isRing && ringChipsHtml ? `
              <div>
                <div class="admin-visual-actions-title" style="font-size: 0.74rem; font-weight: 700; color: var(--brand-terracotta); margin-bottom: 0.35rem;">
                  💍 Aros Recebidos neste Lote:
                </div>
                <div class="admin-visual-aros-list" style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
                  ${ringChipsHtml}
                </div>
              </div>
            ` : ''}

            <div style="background: #FAF8F5; border: 1px solid #EFEAE3; border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span style="color: var(--text-muted);">Custo unitário:</span>
              <strong style="color: var(--text-primary); font-family: monospace;">${formatBRL(it.unit_cost)}</strong>
            </div>
          </div>

          <div class="admin-visual-footer" style="padding: 0.85rem 1rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; background: #FCFBF9;">
            <div>
              <span style="font-size: 0.7rem; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 700;">Subtotal</span>
              <strong style="font-size: 1.05rem; color: var(--brand-terracotta); font-family: monospace;">${formatBRL(subtotal)}</strong>
            </div>
            <div style="display: flex; gap: 0.4rem; align-items: center;">
              ${prod ? `
                <a href="admin-editar-produto?id=${prod.id}" target="_blank" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.35rem 0.65rem;" title="Editar produto no catálogo">
                  Editar
                </a>
              ` : ''}
              <button type="button" class="btn-secondary-action btn-del-item-batch" data-item-id="${it.id}" style="font-size: 0.72rem; padding: 0.35rem 0.6rem; color: #DC2626; border-color: #FCA5A5;" title="Remover este item do lote">
                &times;
              </button>
            </div>
          </div>
        `;
        detailVisualGrid.appendChild(card);
      });
    }

    // 2. Renderiza Planilha Detalhada
    if (detailItemsTbody) {
      detailItemsTbody.innerHTML = '';
      items.forEach(it => {
        const prod = allProducts.find(p => p.id === it.product_id);
        const isSupply = it.item_type === 'insumo';

        let imgUrl = 'assets/images/logo-simbolo.png';
        if (prod && prod.images) {
          let imgs = prod.images;
          if (typeof imgs === 'string') {
            try { imgs = JSON.parse(imgs); } catch(e) { imgs = []; }
          }
          if (Array.isArray(imgs) && imgs.length > 0) imgUrl = imgs[0];
        }

        let ringSummary = '—';
        if (it.notes) {
          try {
            const parsed = JSON.parse(it.notes);
            if (parsed && parsed.sizes) {
              ringSummary = Object.entries(parsed.sizes).filter(([_, q]) => Number(q) > 0).map(([a, q]) => `Aro ${a}(${q})`).join(', ') || '—';
            }
          } catch(e) {
            ringSummary = it.notes;
          }
        }

        const subtotal = (Number(it.quantity) || 1) * (Number(it.unit_cost) || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <img src="${imgUrl}" alt="${it.item_name}" style="width: 38px; height: 38px; border-radius: var(--radius-sm); object-fit: cover;" onerror="this.src='assets/images/logo-simbolo.png'">
          </td>
          <td><span class="badge-category">${isSupply ? 'Insumo' : 'Joia'}</span></td>
          <td>
            <div style="font-weight: 600; font-size: 0.86rem; color: var(--text-primary);">${it.item_name}</div>
            ${prod?.sku ? `<span style="font-family: monospace; font-size: 0.72rem; color: var(--brand-terracotta);">SKU: ${prod.sku}</span>` : ''}
          </td>
          <td style="font-size: 0.78rem; color: var(--text-secondary); max-width: 200px;">${ringSummary}</td>
          <td style="text-align: center; font-weight: 700;">${it.quantity}</td>
          <td style="text-align: right; font-family: monospace;">${formatBRL(it.unit_cost)}</td>
          <td style="text-align: right; font-weight: 700; color: var(--brand-terracotta); font-family: monospace;">${formatBRL(subtotal)}</td>
          <td style="text-align: center;">
            <div style="display: inline-flex; gap: 0.35rem;">
              ${prod ? `
                <a href="admin-editar-produto?id=${prod.id}" target="_blank" class="btn-secondary-action" style="font-size: 0.72rem; padding: 0.3rem 0.55rem;" title="Editar">
                  Editar
                </a>
              ` : ''}
              <button type="button" class="btn-secondary-action btn-del-item-batch" data-item-id="${it.id}" style="font-size: 0.72rem; padding: 0.3rem 0.55rem; color: #DC2626; border-color: #FCA5A5;" title="Remover item">
                Excluir
              </button>
            </div>
          </td>
        `;
        detailItemsTbody.appendChild(tr);
      });
    }

    // Registra listeners de remoção de item
    document.querySelectorAll('.btn-del-item-batch').forEach(btn => {
      btn.addEventListener('click', () => deleteBatchItem(btn.dataset.itemId, b.id));
    });
  }

  // Alternador de Visualização do Lote (Vitrine vs Planilha)
  if (btnDetailViewVisual && btnDetailViewTable) {
    btnDetailViewVisual.addEventListener('click', () => {
      activeDetailView = 'visual';
      btnDetailViewVisual.classList.add('active');
      btnDetailViewTable.classList.remove('active');
      const b = allBatches.find(x => x.id === currentDetailBatchId);
      if (b) renderBatchDetailsContent(b);
    });

    btnDetailViewTable.addEventListener('click', () => {
      activeDetailView = 'table';
      btnDetailViewTable.classList.add('active');
      btnDetailViewVisual.classList.remove('active');
      const b = allBatches.find(x => x.id === currentDetailBatchId);
      if (b) renderBatchDetailsContent(b);
    });
  }

  // Filtro de busca de itens dentro do modal
  if (detailSearchItems) {
    detailSearchItems.addEventListener('input', () => {
      const b = allBatches.find(x => x.id === currentDetailBatchId);
      if (b) renderBatchDetailsContent(b);
    });
  }

  // ==========================================================================
  // EXCLUSÃO DE ITEM DO LOTE
  // ==========================================================================
  async function deleteBatchItem(itemId, batchId) {
    if (!confirm('Deseja realmente remover este item deste lote de compra?')) return;

    try {
      const { error } = await client.from('batch_items').delete().eq('id', itemId);
      if (error) throw error;

      // Recalcula total_cost do lote
      const { data: bItems } = await client.from('batch_items').select('quantity, unit_cost').eq('batch_id', batchId);
      const { data: bData } = await client.from('purchase_batches').select('shipping_cost').eq('id', batchId).maybeSingle();
      const itemsSum = (bItems || []).reduce((acc, it) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)), 0);
      const shipping = Number(bData?.shipping_cost) || 0;
      const newTotal = itemsSum + shipping;

      await client.from('purchase_batches').update({
        total_cost: newTotal,
        updated_at: new Date().toISOString()
      }).eq('id', batchId);

      // Atualiza estado local
      const b = allBatches.find(x => x.id === batchId);
      if (b) {
        b.items = (b.items || []).filter(x => x.id !== itemId);
        b.total_cost = newTotal;
        detailBatchTotal.textContent = formatBRL(newTotal);
        renderBatchDetailsContent(b);
      }

      renderBatchesTable();
      updateKpis();
      showToast('Item removido do lote com sucesso.', 'success');
    } catch (e) {
      console.error('Erro ao remover item:', e);
      showToast('Erro ao remover item: ' + e.message, 'error');
    }
  }

  // ==========================================================================
  // SUB-MODAL: INCLUIR ITEM NO LOTE ATUAL (COM GRADE DE AROS SE ANEL)
  // ==========================================================================
  function openAddItemModal() {
    if (!currentDetailBatchId) return;
    const b = allBatches.find(x => x.id === currentDetailBatchId);
    if (!b) return;

    if (addItemModalSubtitle) {
      addItemModalSubtitle.textContent = `Vinculando item ao lote ${b.batch_code} (${b.vendor?.trade_name || b.vendor?.name || 'Fornecedor'}).`;
    }

    formAddBatchItem.reset();
    populateAddItemSelect();
    if (addItemPreviewCard) addItemPreviewCard.style.display = 'none';
    if (addItemRingSizesBox) addItemRingSizesBox.style.display = 'none';

    modalAddItemToBatch.classList.add('active');
  }

  function closeAddItemModal() {
    modalAddItemToBatch.classList.remove('active');
  }

  if (btnOpenAddItemModal) btnOpenAddItemModal.addEventListener('click', openAddItemModal);
  document.querySelectorAll('.btn-trigger-add-item').forEach(btn => btn.addEventListener('click', openAddItemModal));
  if (btnCloseAddItemModal) btnCloseAddItemModal.addEventListener('click', closeAddItemModal);
  if (btnCancelAddItem) btnCancelAddItem.addEventListener('click', closeAddItemModal);
  if (modalAddItemToBatch) {
    modalAddItemToBatch.addEventListener('click', (e) => {
      if (e.target === modalAddItemToBatch) closeAddItemModal();
    });
  }

  function populateAddItemSelect() {
    const type = addItemType.value;
    addItemSelect.innerHTML = '<option value="">Selecione a peça...</option>';

    if (type === 'produto') {
      allProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.sku ? `[${p.sku}] ` : ''}${p.name}`;
        opt.dataset.cost = p.product_cost || 0;
        opt.dataset.category = p.category || '';
        opt.dataset.sku = p.sku || '';
        opt.dataset.name = p.name || '';
        addItemSelect.appendChild(opt);
      });
    } else {
      allSupplies.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.unit || 'un'})`;
        opt.dataset.cost = s.unit_cost || 0;
        addItemSelect.appendChild(opt);
      });
    }
  }

  if (addItemType) {
    addItemType.addEventListener('change', () => {
      populateAddItemSelect();
      if (addItemPreviewCard) addItemPreviewCard.style.display = 'none';
      if (addItemRingSizesBox) addItemRingSizesBox.style.display = 'none';
    });
  }

  if (addItemSelect) {
    addItemSelect.addEventListener('change', () => {
      const selectedId = addItemSelect.value;
      if (!selectedId) {
        if (addItemPreviewCard) addItemPreviewCard.style.display = 'none';
        if (addItemRingSizesBox) addItemRingSizesBox.style.display = 'none';
        return;
      }

      const type = addItemType.value;
      if (type === 'produto') {
        const prod = allProducts.find(p => p.id === selectedId);
        if (prod) {
          // Preenche custo
          addItemCost.value = prod.product_cost ? Number(prod.product_cost).toFixed(2) : '';

          // Atualiza card de preview
          if (addItemPreviewCard) {
            addItemPreviewCard.style.display = 'flex';
            if (addItemPreviewSku) addItemPreviewSku.textContent = prod.sku || 'SEM SKU';
            if (addItemPreviewName) addItemPreviewName.textContent = prod.name;
            if (addItemPreviewCategory) addItemPreviewCategory.textContent = prod.category || 'Semijoia';

            let imgUrl = 'assets/images/logo-simbolo.png';
            if (prod.images) {
              let imgs = prod.images;
              if (typeof imgs === 'string') {
                try { imgs = JSON.parse(imgs); } catch(e) { imgs = []; }
              }
              if (Array.isArray(imgs) && imgs.length > 0) imgUrl = imgs[0];
            }
            if (addItemPreviewImg) addItemPreviewImg.src = imgUrl;
          }

          // Verifica se categoria é Anel
          const cat = (prod.category || '').toLowerCase();
          const isRing = cat.includes('an') || (prod.sizes && Object.keys(prod.sizes).length > 0);

          if (isRing && addItemRingSizesBox && addItemRingGrid) {
            addItemRingSizesBox.style.display = 'block';
            addItemRingGrid.innerHTML = '';

            for (let s = 10; s <= 30; s++) {
              const div = document.createElement('div');
              div.style.display = 'flex';
              div.style.flexDirection = 'column';
              div.style.alignItems = 'center';
              div.style.background = '#FFFFFF';
              div.style.border = '1px solid #E5E7EB';
              div.style.borderRadius = 'var(--radius-sm)';
              div.style.padding = '0.3rem 0.2rem';

              div.innerHTML = `
                <span style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.15rem;">${s}</span>
                <input type="number" min="0" step="1" class="add-item-ring-input" data-size="${s}" placeholder="0" style="width: 100%; border: none; font-size: 0.8rem; text-align: center; font-weight: 600; padding: 0.15rem 0; background: transparent;">
              `;
              addItemRingGrid.appendChild(div);
            }

            // Listener para recalcular total a partir dos aros
            addItemRingGrid.querySelectorAll('.add-item-ring-input').forEach(input => {
              input.addEventListener('input', () => {
                let sum = 0;
                addItemRingGrid.querySelectorAll('.add-item-ring-input').forEach(inp => {
                  const val = parseInt(inp.value, 10);
                  if (!isNaN(val) && val > 0) sum += val;
                });
                addItemQty.value = sum > 0 ? sum : 1;
                if (addItemRingTotalBadge) addItemRingTotalBadge.textContent = `Total: ${sum} un`;
              });
            });
          } else {
            if (addItemRingSizesBox) addItemRingSizesBox.style.display = 'none';
          }
        }
      } else {
        const sup = allSupplies.find(s => s.id === selectedId);
        if (sup) {
          addItemCost.value = sup.unit_cost ? Number(sup.unit_cost).toFixed(2) : '';
        }
        if (addItemPreviewCard) addItemPreviewCard.style.display = 'none';
        if (addItemRingSizesBox) addItemRingSizesBox.style.display = 'none';
      }
    });
  }

  // Submissão do formulário de inclusão de item no lote
  if (formAddBatchItem) {
    formAddBatchItem.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!currentDetailBatchId) return;
      const b = allBatches.find(x => x.id === currentDetailBatchId);
      if (!b) return;

      const selectedId = addItemSelect.value;
      const type = addItemType.value;
      const qty = parseFloat(addItemQty.value) || 1;
      const cost = parseFloat(addItemCost.value) || 0;

      if (!selectedId) {
        showToast('Selecione o item a incluir.', 'error');
        return;
      }
      if (qty <= 0) {
        showToast('Informe uma quantidade maior que zero.', 'error');
        return;
      }

      btnSaveBatchItem.disabled = true;
      btnSaveBatchItem.textContent = 'Adicionando...';

      try {
        let selectedName = 'Item sem nome';
        let ringNotes = null;
        let ringSizesObj = {};

        if (type === 'produto') {
          const prod = allProducts.find(p => p.id === selectedId);
          selectedName = prod ? `[${prod.sku || 'SEM-SKU'}] ${prod.name}` : 'Joia';

          // Coleta aros se houver
          if (addItemRingSizesBox && addItemRingSizesBox.style.display !== 'none') {
            addItemRingGrid.querySelectorAll('.add-item-ring-input').forEach(inp => {
              const val = parseInt(inp.value, 10);
              const aro = inp.dataset.size;
              if (!isNaN(val) && val > 0) {
                ringSizesObj[aro] = val;
              }
            });
            if (Object.keys(ringSizesObj).length > 0) {
              ringNotes = JSON.stringify({ sizes: ringSizesObj });
            }
          }
        } else {
          const sup = allSupplies.find(s => s.id === selectedId);
          selectedName = sup ? `${sup.name} (${sup.unit || 'un'})` : 'Insumo';
        }

        const newBatchItemPayload = {
          batch_id: b.id,
          item_type: type,
          product_id: type === 'produto' ? selectedId : null,
          supply_id: type === 'insumo' ? selectedId : null,
          item_name: selectedName,
          quantity: qty,
          unit_cost: cost,
          notes: ringNotes
        };

        const { data: createdItem, error: itemErr } = await client
          .from('batch_items')
          .insert([newBatchItemPayload])
          .select()
          .single();

        if (itemErr) throw itemErr;

        // Se marcou para incrementar estoque
        if (addItemSyncStock && addItemSyncStock.checked && type === 'produto') {
          try {
            const currentProd = allProducts.find(p => p.id === selectedId);
            if (currentProd) {
              const newStock = (parseInt(currentProd.stock, 10) || 0) + parseInt(qty, 10);
              const updatePayload = {
                stock: newStock,
                batch_id: b.id,
                vendor_id: b.vendor_id || currentProd.vendor_id
              };

              // Mescla aros se configurados
              if (Object.keys(ringSizesObj).length > 0) {
                let currentSizes = currentProd.sizes || {};
                if (typeof currentSizes === 'string') {
                  try { currentSizes = JSON.parse(currentSizes); } catch(e) { currentSizes = {}; }
                }
                const mergedSizes = { ...currentSizes };
                Object.entries(ringSizesObj).forEach(([aro, q]) => {
                  mergedSizes[aro] = (parseInt(mergedSizes[aro], 10) || 0) + parseInt(q, 10);
                });
                updatePayload.sizes = mergedSizes;
                currentProd.sizes = mergedSizes;
              }

              currentProd.stock = newStock;
              await client.from('products').update(updatePayload).eq('id', selectedId);
            }
          } catch(stockErr) {
            console.warn('Aviso ao sincronizar estoque:', stockErr);
          }
        }

        // Recalcula total_cost do lote
        const { data: bItems } = await client.from('batch_items').select('quantity, unit_cost').eq('batch_id', b.id);
        const { data: bData } = await client.from('purchase_batches').select('shipping_cost').eq('id', b.id).maybeSingle();
        const itemsSum = (bItems || []).reduce((acc, it) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)), 0);
        const shipping = Number(bData?.shipping_cost) || 0;
        const newTotal = itemsSum + shipping;

        await client.from('purchase_batches').update({
          total_cost: newTotal,
          updated_at: new Date().toISOString()
        }).eq('id', b.id);

        // Atualiza estado local
        b.items = b.items || [];
        b.items.push(createdItem || newBatchItemPayload);
        b.total_cost = newTotal;
        detailBatchTotal.textContent = formatBRL(newTotal);

        closeAddItemModal();
        renderBatchDetailsContent(b);
        renderBatchesTable();
        updateKpis();

        showToast(`Item "${selectedName}" adicionado ao lote com sucesso!`, 'success');

      } catch (err) {
        console.error('Erro ao adicionar item ao lote:', err);
        showToast('Erro ao adicionar item: ' + err.message, 'error');
      } finally {
        btnSaveBatchItem.disabled = false;
        btnSaveBatchItem.textContent = 'Adicionar ao Lote';
      }
    });
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
