/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Cadastro e Edição de Produtos com Vínculo de Insumos e Geração Automática de SKU
 */

document.addEventListener('DOMContentLoaded', () => {
  const adminEmailElem = document.getElementById('admin-user-email');
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  // Parâmetros de URL (Modo Edição redireciona para a nova página dedicada)
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  if (productId) {
    window.location.replace(`admin-editar-produto.html?id=${encodeURIComponent(productId)}`);
    return;
  }
  const isEditMode = false;

  // Elementos do Formulário
  const pageTitle = document.getElementById('page-title');
  const form = document.getElementById('product-form');
  const btnSave = document.getElementById('btn-save-product');

  const nameInput = document.getElementById('prod-name');
  const statusInput = document.getElementById('prod-status');
  const categoryInput = document.getElementById('prod-category');
  const skuInput = document.getElementById('prod-sku');
  const descInput = document.getElementById('prod-description');
  const costInput = document.getElementById('prod-cost');
  const priceInput = document.getElementById('prod-price');
  const originalPriceInput = document.getElementById('prod-original-price');
  const stockInput = document.getElementById('prod-stock');
  const stockHelpText = document.getElementById('stock-help-text');
  const ringSizesWrapper = document.getElementById('ring-sizes-wrapper');
  const ringSizeInputs = document.querySelectorAll('.ring-size-input');

  const photoSlots = [
    document.getElementById('prod-img-1'),
    document.getElementById('prod-img-2'),
    document.getElementById('prod-img-3'),
    document.getElementById('prod-img-4'),
    document.getElementById('prod-img-5'),
    document.getElementById('prod-img-6')
  ];
  const imgCountBadge = document.getElementById('img-count-badge');
  const imagePreviewsContainer = document.getElementById('image-previews');
  const uploadZone = document.getElementById('upload-zone');
  const imageFileInput = document.getElementById('image-file-input');
  const btnGenerateSku = document.getElementById('btn-generate-sku');

  // Elementos de Insumos
  const supplySelect = document.getElementById('supply-select');
  const supplyQtyInput = document.getElementById('supply-qty');
  const btnAddSupply = document.getElementById('btn-add-supply');
  const linkedSuppliesTbody = document.getElementById('linked-supplies-tbody');

  // Elementos do Cálculo ao Vivo e Markup
  const calcProdCost = document.getElementById('calc-prod-cost');
  const calcSuppliesCost = document.getElementById('calc-supplies-cost');
  const calcTotalCost = document.getElementById('calc-total-cost');
  const calcSalePrice = document.getElementById('calc-sale-price');
  const calcUnitProfit = document.getElementById('calc-unit-profit');
  const btnRecalc300 = document.getElementById('btn-recalc-300');
  const badgeMarkup = document.getElementById('badge-markup-300');

  // Elementos dos Modais (Confirmação de SKU e Upload de Fotos)
  const skuConfirmModal = document.getElementById('sku-confirm-modal');
  const btnCancelSkuConfirm = document.getElementById('btn-cancel-sku-confirm');
  const btnProceedSkuConfirm = document.getElementById('btn-proceed-sku-confirm');
  const confirmSkuDisplay = document.getElementById('confirm-sku-display');

  const uploadProgressModal = document.getElementById('upload-progress-modal');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadProgressPct = document.getElementById('upload-progress-pct');
  const uploadProgressStatus = document.getElementById('upload-progress-status');

  // Estado Local
  let availableSupplies = [];
  let linkedSupplies = []; // [{ supply_id, name, unit_cost, unit, quantity }]
  let currentImages = [];
  let manualPriceEdited = false;

  // Helper para resolução resiliente do cliente Supabase
  function getDbClient() {
    if (typeof getSupabaseClient === 'function') {
      const c = getSupabaseClient();
      if (c) return c;
    }
    if (typeof db !== 'undefined' && db) return db;
    if (typeof window !== 'undefined' && window.db) return window.db;
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined') {
      const c = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.db = c;
      return c;
    }
    return null;
  }

  if (isEditMode) {
    if (pageTitle) pageTitle.textContent = 'Editar Produto';
    if (btnSave) btnSave.textContent = 'Atualizar Produto & Insumos';
  }

  // Inicialização visual e de eventos imediatos
  toggleRingSizes();
  recalculateFinancials();
  renderImagePreviews();

  // Inicialização assíncrona de dados (autenticação, insumos e produto)
  (async function initAsyncData() {
    try {
      // 1. Atualiza status do operador imediatamente sem travar
      if (adminEmailElem) {
        try {
          const user = await getCurrentUser();
          adminEmailElem.textContent = (user && user.email) ? user.email : 'Painel Soléria';
        } catch (e) {
          adminEmailElem.textContent = 'Painel Soléria';
        }
      }

      // 2. Carrega insumos disponíveis PRIMEIRO (para poder vincular custos se for edição)
      await loadAvailableSupplies();

      // 3. PRIORIDADE MÁXIMA: Carrega imediatamente os dados do produto no modo edição
      if (isEditMode) {
        await loadProductData(productId);
      } else {
        await updateGeneratedSku();
      }
    } catch (err) {
      console.error('Aviso ao sincronizar dados iniciais:', err);
    } finally {
      renderImagePreviews();
      recalculateFinancials();
    }
  })();

  // ==========================================================================
  // Geração Automática de SKU (PREFIXO-0000)
  // ==========================================================================

  async function updateGeneratedSku() {
    const category = categoryInput.value.trim() || 'Geral';
    const prefix = generateCategoryPrefix(category);

    try {
      const authToken = (typeof getAuthToken === 'function' ? getAuthToken() : null) || SUPABASE_ANON_KEY;
      if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?sku=ilike.${encodeURIComponent(prefix + '-%')}&select=id`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${authToken}`,
            'Range-Unit': 'items',
            'Range': '0-0',
            'Prefer': 'count=exact'
          }
        });
        if (res.ok) {
          const crange = res.headers.get('content-range');
          if (crange && crange.includes('/')) {
            const total = parseInt(crange.split('/')[1], 10);
            if (!isNaN(total)) {
              const seq = (total + 1).toString().padStart(4, '0');
              skuInput.value = `${prefix}-${seq}`;
              return;
            }
          }
        }
      }

      const client = getDbClient();
      if (client && isSupabaseConfigured()) {
        const queryPromise = client
          .from('products')
          .select('id', { count: 'exact', head: true })
          .ilike('sku', `${prefix}-%`);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout sku')), 2000));
        const { count } = await Promise.race([queryPromise, timeoutPromise]);
        const seq = ((count || 0) + 1).toString().padStart(4, '0');
        skuInput.value = `${prefix}-${seq}`;
      } else {
        skuInput.value = `${prefix}-0001`;
      }
    } catch (e) {
      skuInput.value = `${prefix}-0001`;
    }
  }

  if (btnGenerateSku) {
    btnGenerateSku.addEventListener('click', () => {
      updateGeneratedSku();
    });
  }

  categoryInput.addEventListener('change', () => {
    if (!isEditMode || !skuInput.value) {
      updateGeneratedSku();
    }
    toggleRingSizes();
  });

  categoryInput.addEventListener('input', () => {
    toggleRingSizes();
  });

  // ==========================================================================
  // Gerenciamento Especial de Grade de Tamanhos para Anéis (Aro 10 ao 20)
  // ==========================================================================

  function isRingCategory(cat) {
    if (!cat) return false;
    const clean = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return clean.includes('anel') || clean.includes('aneis');
  }

  function toggleRingSizes() {
    if (ringSizesWrapper) {
      if (isRingCategory(categoryInput.value)) {
        ringSizesWrapper.style.display = 'block';
        if (stockHelpText) stockHelpText.textContent = 'Somado automaticamente a partir da grade de aros';
      } else {
        ringSizesWrapper.style.display = 'none';
        if (stockHelpText) stockHelpText.textContent = 'Unidades totais disponíveis';
      }
    }
  }

  function updateRingStockTotal() {
    let totalStock = 0;
    let hasSizes = false;
    ringSizeInputs.forEach(input => {
      const qty = parseInt(input.value, 10);
      const parent = input.closest('.ring-size-item');
      if (!isNaN(qty) && qty > 0) {
        totalStock += qty;
        hasSizes = true;
        if (parent) parent.classList.add('has-stock');
      } else {
        if (parent) parent.classList.remove('has-stock');
      }
    });

    if (isRingCategory(categoryInput.value)) {
      stockInput.value = totalStock;
      recalculateFinancials();
    }
  }

  function getRingSizesData() {
    const sizes = {};
    ringSizeInputs.forEach(input => {
      const qty = parseInt(input.value, 10);
      const size = input.dataset.size;
      if (!isNaN(qty) && qty > 0) {
        sizes[size] = qty;
      }
    });
    return sizes;
  }

  ringSizeInputs.forEach(input => {
    input.addEventListener('input', updateRingStockTotal);
  });

  // ==========================================================================
  // Gerenciamento de Imagens (Upload e 6 Slots Fixos de URL)
  // ==========================================================================

  /**
   * Valida se uma string representa um link ou caminho de imagem válido.
   * Suporta links absolutos (https/http), Data URLs, Supabase Storage e caminhos locais/relativos (assets/...).
   */
  function isValidImageUrl(val) {
    if (!val || typeof val !== 'string') return false;
    const v = val.trim();
    if (!v) return false;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/') || v.startsWith('blob:') || v.startsWith('/') || v.startsWith('./') || v.startsWith('assets/')) {
      return true;
    }
    if (/\.(jpg|jpeg|png|webp|avif|gif|svg)(\?.*)?$/i.test(v)) {
      return true;
    }
    if (v.includes('supabase.co')) {
      return true;
    }
    return false;
  }

  /**
   * Obtém a lista consolidada de URLs válidas (campos vazios são ignorados).
   * Garante no máximo 6 fotos.
   */
  function getValidImages() {
    const valid = [];
    photoSlots.forEach(slot => {
      if (!slot) return;
      const val = slot.value.trim();
      if (val && isValidImageUrl(val)) {
        valid.push(val);
      }
    });
    return valid.slice(0, 6);
  }

  /**
   * Preenche os 6 slots com uma lista de URLs e limpa os excedentes
   */
  function syncSlotsFromImages(imagesList) {
    const list = Array.isArray(imagesList) ? imagesList.slice(0, 6) : [];
    photoSlots.forEach((slot, idx) => {
      if (slot) {
        slot.value = list[idx] || '';
      }
    });
    renderImagePreviews();
  }

  let pendingImageFiles = []; // [{ file, previewUrl, name }]

  /**
   * Renderiza as miniaturas das fotos preenchidas e arquivos pendentes de upload
   */
  function renderImagePreviews() {
    const validImages = getValidImages();
    currentImages = validImages;
    const totalCount = validImages.length + pendingImageFiles.length;

    if (imgCountBadge) {
      imgCountBadge.textContent = totalCount;
    }

    imagePreviewsContainer.innerHTML = '';

    if (totalCount === 0) {
      imagePreviewsContainer.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic; padding: 0.5rem 0;">
          Nenhuma foto adicionada ainda. Adicione links nos campos acima ou selecione imagens para envio.
        </div>
      `;
      return;
    }

    // 1. Fotos já existentes com URL direta
    validImages.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.style.position = 'relative';
      item.innerHTML = `
        <img src="${url}" alt="Foto ${idx + 1}" onerror="this.onerror=null; this.src='assets/images/logo-simbolo.png';">
        ${idx === 0 && pendingImageFiles.length === 0 ? '<span style="position: absolute; bottom: 2px; left: 2px; background: rgba(197, 164, 101, 0.95); color: #181614; font-size: 0.55rem; font-weight: 700; padding: 1px 4px; border-radius: 2px; text-transform: uppercase;">Capa</span>' : ''}
        <button type="button" class="image-preview-remove btn-remove-saved" data-index="${idx}" title="Remover esta foto">&times;</button>
      `;
      imagePreviewsContainer.appendChild(item);
    });

    // 2. Fotos selecionadas no computador (pendentes de envio no clique de Salvar)
    pendingImageFiles.forEach((p, pIdx) => {
      const isCover = validImages.length === 0 && pIdx === 0;
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.style.position = 'relative';
      item.innerHTML = `
        <img src="${p.previewUrl}" alt="${p.name}">
        <span style="position: absolute; bottom: 2px; left: 2px; background: #B45309; color: #FFFFFF; font-size: 0.55rem; font-weight: 700; padding: 1px 4px; border-radius: 2px;">
          ${isCover ? 'Capa (Upload)' : 'Upload Pendente'}
        </span>
        <button type="button" class="image-preview-remove btn-remove-pending" data-pindex="${pIdx}" title="Remover esta foto selecionada">&times;</button>
      `;
      imagePreviewsContainer.appendChild(item);
    });

    // Eventos de remoção de fotos salvas
    imagePreviewsContainer.querySelectorAll('.btn-remove-saved').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        const updated = getValidImages();
        updated.splice(index, 1);
        syncSlotsFromImages(updated);
      });
    });

    // Eventos de remoção de fotos pendentes
    imagePreviewsContainer.querySelectorAll('.btn-remove-pending').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pIdx = parseInt(e.target.dataset.pindex, 10);
        if (pendingImageFiles[pIdx]) {
          URL.revokeObjectURL(pendingImageFiles[pIdx].previewUrl);
          pendingImageFiles.splice(pIdx, 1);
          renderImagePreviews();
        }
      });
    });
  }

  // Monitora alterações manuais em cada um dos 6 slots
  photoSlots.forEach(slot => {
    if (!slot) return;
    slot.addEventListener('input', () => renderImagePreviews());
    slot.addEventListener('change', () => renderImagePreviews());
    slot.addEventListener('paste', () => setTimeout(renderImagePreviews, 60));
    slot.addEventListener('blur', () => renderImagePreviews());
  });

  // Seleção e buffer de fotos (upload diferido para o clique em Salvar)
  if (imageFileInput) {
    imageFileInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        bufferFilesForDeferredUpload(e.target.files);
      }
    });
  }

  if (uploadZone) {
    uploadZone.addEventListener('click', (e) => {
      if (e.target === imageFileInput) return;
      // Se o container for um label com for="image-file-input", o navegador já aciona nativamente
      if (uploadZone.tagName === 'LABEL' && uploadZone.getAttribute('for') === 'image-file-input') return;
      if (imageFileInput) imageFileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--gold-primary)';
      uploadZone.style.backgroundColor = 'var(--gold-light)';
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.style.borderColor = '';
      uploadZone.style.backgroundColor = '';
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '';
      uploadZone.style.backgroundColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        bufferFilesForDeferredUpload(e.dataTransfer.files);
      }
    });
  }

  function bufferFilesForDeferredUpload(fileList) {
    const currentValid = getValidImages();
    const remainingSlots = 6 - (currentValid.length + pendingImageFiles.length);

    if (remainingSlots <= 0) {
      showToast('Limite máximo de 6 fotos por produto já atingido.', 'warning', 4000);
      return;
    }

    const filesToAdd = Array.from(fileList).slice(0, remainingSlots);
    if (fileList.length > remainingSlots) {
      showToast(`Apenas ${remainingSlots} foto(s) aceita(s) para respeitar o limite de 6 fotos.`, 'info', 4000);
    }

    filesToAdd.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      pendingImageFiles.push({ file, previewUrl, name: file.name });
    });

    renderImagePreviews();
    showToast(`${filesToAdd.length} foto(s) selecionada(s). As imagens serão enviadas ao banco quando você clicar em "Salvar Produto".`, 'info', 4500);

    imageFileInput.value = '';
  }

  // ==========================================================================
  // Carregamento de Insumos Disponíveis (Tabela supplies)
  // ==========================================================================

  async function fetchSuppliesDirect() {
    const authToken = (typeof getAuthToken === 'function' ? getAuthToken() : null) || SUPABASE_ANON_KEY;
    const authHeaders = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authToken}`
    };

    // 1. Tenta REST direto primeiro (imune a locks de sessão e ultra-rápido)
    try {
      if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/supplies?select=*&order=name.asc`, {
          headers: authHeaders
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
        }
      }
    } catch (e) {
      console.warn('REST supplies falhou, tentando client JS:', e);
    }

    // 2. Fallback Supabase Client com timeout
    try {
      const client = getDbClient();
      if (client) {
        const queryPromise = client
          .from('supplies')
          .select('*')
          .order('name', { ascending: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout supplies')), 2500));
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
        if (!error && Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {}

    return [];
  }

  async function loadAvailableSupplies() {
    try {
      const data = await fetchSuppliesDirect();
      availableSupplies = data || [];
      if (supplySelect) {
        supplySelect.innerHTML = '<option value="">-- Selecione um insumo cadastrado --</option>';
        availableSupplies.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name} (${formatBRL(s.unit_cost)} / ${s.unit || 'un'})`;
          opt.dataset.cost = s.unit_cost;
          opt.dataset.unit = s.unit || 'un';
          opt.dataset.name = s.name;
          supplySelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Erro ao listar insumos:', e);
    }
  }

  // ==========================================================================
  // Adição e Remoção de Insumos Vinculados (product_supplies)
  // ==========================================================================

  function renderLinkedSuppliesTable() {
    linkedSuppliesTbody.innerHTML = '';

    if (linkedSupplies.length === 0) {
      linkedSuppliesTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            Nenhum insumo vinculado a esta peça ainda.
          </td>
        </tr>
      `;
      recalculateFinancials();
      return;
    }

    linkedSupplies.forEach((item, index) => {
      const subtotal = item.unit_cost * item.quantity;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 500;">${item.name}</td>
        <td style="text-align: right;" class="val-currency">${formatBRL(item.unit_cost)} / ${item.unit}</td>
        <td style="text-align: center;">${item.quantity} ${item.unit}</td>
        <td style="text-align: right;" class="val-currency">${formatBRL(subtotal)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-danger-outline" data-index="${index}" style="padding: 0.2rem 0.5rem;" title="Remover este insumo">&times;</button>
        </td>
      `;
      linkedSuppliesTbody.appendChild(tr);
    });

    // Event listeners para remover
    linkedSuppliesTbody.querySelectorAll('.btn-danger-outline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        linkedSupplies.splice(idx, 1);
        renderLinkedSuppliesTable();
      });
    });

    recalculateFinancials();
  }

  btnAddSupply.addEventListener('click', () => {
    const supplyId = supplySelect.value;
    const qty = parseFloat(supplyQtyInput.value);

    if (!supplyId) {
      showToast('Selecione um insumo para vincular.', 'error');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      showToast('Informe uma quantidade válida superior a 0.', 'error');
      return;
    }

    const selectedSupply = availableSupplies.find(s => s.id == supplyId);
    if (!selectedSupply) return;

    // Se já existe, atualiza a quantidade
    const existingIndex = linkedSupplies.findIndex(item => item.supply_id == supplyId);
    if (existingIndex >= 0) {
      linkedSupplies[existingIndex].quantity = parseFloat((linkedSupplies[existingIndex].quantity + qty).toFixed(4));
    } else {
      linkedSupplies.push({
        supply_id: selectedSupply.id,
        name: selectedSupply.name,
        unit_cost: Number(selectedSupply.unit_cost) || 0,
        unit: selectedSupply.unit || 'un',
        quantity: qty
      });
    }

    supplySelect.value = '';
    supplyQtyInput.value = '1';
    renderLinkedSuppliesTable();
    showToast('Insumo vinculado com sucesso!', 'success');
  });


  // ==========================================================================
  // Calculadora Financeira em Tempo Real & Simulação 300%
  // ==========================================================================

  function parseVal(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = String(val).replace(/[^\d.,-]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function recalculateFinancials(autoMarkup = false) {
    const prodCost = parseVal(costInput ? costInput.value : 0);

    let suppliesCost = 0;
    if (Array.isArray(linkedSupplies)) {
      linkedSupplies.forEach(item => {
        const uCost = parseVal(item.unit_cost);
        const qty = parseVal(item.quantity);
        suppliesCost += (uCost * qty);
      });
    }

    const totalCost = prodCost + suppliesCost;
    const currentPrice = parseVal(priceInput ? priceInput.value : 0);

    // Se autoMarkup for solicitado OU se o preço ainda não foi editado manualmente ou está zerado
    if (totalCost > 0 && (autoMarkup || !manualPriceEdited || currentPrice <= 0)) {
      // 300% de markup sobre o custo total (preço = custo * 4)
      const simulatedPrice = totalCost * 4.0;
      if (priceInput) priceInput.value = simulatedPrice.toFixed(2);
      if (originalPriceInput && (!originalPriceInput.value || originalPriceInput.dataset.autoFilled === 'true' || currentPrice <= 0)) {
        originalPriceInput.value = (simulatedPrice * 1.4).toFixed(2);
        originalPriceInput.dataset.autoFilled = 'true';
      }
    }

    const salePrice = parseVal(priceInput ? priceInput.value : 0);
    const unitProfit = salePrice - totalCost;

    if (calcProdCost) calcProdCost.textContent = formatBRL(prodCost);
    if (calcSuppliesCost) calcSuppliesCost.textContent = formatBRL(suppliesCost);
    if (calcTotalCost) calcTotalCost.textContent = formatBRL(totalCost);
    if (calcSalePrice) calcSalePrice.textContent = formatBRL(salePrice);
    if (calcUnitProfit) calcUnitProfit.textContent = formatBRL(unitProfit);

    if (badgeMarkup) {
      if (totalCost > 0 && salePrice > 0) {
        const markupPct = Math.round(((salePrice - totalCost) / totalCost) * 100);
        badgeMarkup.textContent = `${markupPct}% Markup`;
      } else {
        badgeMarkup.textContent = '300% Simulado';
      }
    }

    if (calcUnitProfit) {
      if (unitProfit < 0) {
        calcUnitProfit.classList.remove('highlight-green');
        calcUnitProfit.style.color = '#dc3545';
      } else {
        calcUnitProfit.classList.add('highlight-green');
        calcUnitProfit.style.color = '';
      }
    }
  }

  if (btnRecalc300) {
    btnRecalc300.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      manualPriceEdited = false;
      const prodCost = parseVal(costInput ? costInput.value : 0);
      let suppliesCost = 0;
      if (Array.isArray(linkedSupplies)) {
        linkedSupplies.forEach(item => suppliesCost += (parseVal(item.unit_cost) * parseVal(item.quantity)));
      }
      const totalCost = prodCost + suppliesCost;
      if (totalCost > 0) {
        const simulatedPrice = totalCost * 4.0;
        if (priceInput) priceInput.value = simulatedPrice.toFixed(2);
        if (originalPriceInput) {
          originalPriceInput.value = (simulatedPrice * 1.4).toFixed(2);
          originalPriceInput.dataset.autoFilled = 'true';
        }
        recalculateFinancials(true);
        showToast(`Preço recalculado para ${formatBRL(simulatedPrice)} (300% sobre custo total de ${formatBRL(totalCost)}).`, 'success');
      } else {
        showToast('Informe o custo direto da peça para calcular os 300%.', 'info');
        if (costInput) costInput.focus();
      }
    });
  }

  function autoGenerateOriginalPrice() {
    const sale = parseVal(priceInput ? priceInput.value : 0);
    if (sale > 0 && originalPriceInput && (!originalPriceInput.value || originalPriceInput.dataset.autoFilled === 'true')) {
      const randomFactor = 1.35 + Math.random() * 0.15; // 35% a 50% acima
      const raw = sale * randomFactor;
      const rounded = (Math.ceil(raw) - 0.10).toFixed(2);
      originalPriceInput.value = rounded;
      originalPriceInput.dataset.autoFilled = 'true';
    }
  }

  ['input', 'change', 'keyup', 'paste'].forEach(evt => {
    if (costInput) {
      costInput.addEventListener(evt, () => {
        const curPrice = parseVal(priceInput ? priceInput.value : 0);
        const shouldAutoMarkup = !manualPriceEdited || curPrice <= 0;
        recalculateFinancials(shouldAutoMarkup);
      });
    }
    if (priceInput) {
      priceInput.addEventListener(evt, () => {
        const val = parseVal(priceInput.value);
        if (val > 0) {
          manualPriceEdited = true;
          recalculateFinancials(false);
          autoGenerateOriginalPrice();
        } else {
          manualPriceEdited = false;
          recalculateFinancials(true);
        }
      });
    }
  });

  if (originalPriceInput) {
    originalPriceInput.addEventListener('input', () => {
      delete originalPriceInput.dataset.autoFilled;
    });
  }

  // ==========================================================================
  // Modo Edição: Carregamento dos dados existentes
  // ==========================================================================

  async function fetchProductDirect(cleanId) {
    if (!cleanId) return null;

    const authToken = (typeof getAuthToken === 'function' ? getAuthToken() : null) || SUPABASE_ANON_KEY;
    const authHeaders = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authToken}`
    };

    // 1. Tenta REST direto primeiro (Ultra-rápido ~15ms, imune a locks do SDK e sem travar em múltiplas abas)
    try {
      if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        // Busca por id (UUID)
        const endpoint = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(cleanId)}&select=*`;
        const res = await fetch(endpoint, { headers: authHeaders });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) return list[0];
          if (list && list.id) return list;
        }

        // Se não achou por ID, tenta buscar por SKU
        const skuEndpoint = `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(cleanId)}&select=*`;
        const resSku = await fetch(skuEndpoint, { headers: authHeaders });
        if (resSku.ok) {
          const listSku = await resSku.json();
          if (Array.isArray(listSku) && listSku.length > 0) return listSku[0];
          if (listSku && listSku.id) return listSku;
        }
      }
    } catch (err) {
      console.warn('Erro no fetch direto REST, tentando client JS:', err);
    }

    // 2. Fallback via cliente Supabase JS (com timeout protetor para garantir que nunca trave)
    try {
      const client = getDbClient();
      if (client) {
        const queryPromise = (async () => {
          let { data } = await client
            .from('products')
            .select('*')
            .eq('id', cleanId)
            .maybeSingle();

          if (data) return data;

          let { data: bySku } = await client
            .from('products')
            .select('*')
            .eq('sku', cleanId)
            .maybeSingle();

          return bySku;
        })();

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout Supabase Client')), 2500)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);
        if (result) return result;
      }
    } catch (e) {
      console.warn('Tentativa via client JS falhou:', e);
    }

    return null;
  }

  async function loadProductData(id) {
    try {
      const cleanId = String(id || '').trim();
      if (!cleanId) return;

      const prod = await fetchProductDirect(cleanId);

      if (!prod) {
        console.warn('Produto não localizado no banco.');
        showToast('Produto não encontrado para edição.', 'error');
        return;
      }

      nameInput.value = prod.name || '';
      statusInput.value = prod.status || 'ativo';
      categoryInput.value = prod.category || '';
      
      // SKU com fallback e sugestão automática caso ausente no registro
      skuInput.value = prod.sku || prod.SKU || prod.codigo || '';
      if (!skuInput.value && prod.category) {
        await updateGeneratedSku();
      }

      // Descrição completa da semijoia
      descInput.value = prod.description ?? prod.desc ?? prod.descricao ?? prod.detalhes ?? '';

      const resolvedCost = Number(prod.product_cost ?? prod.cost ?? prod.cost_price ?? 0);
      const resolvedPrice = Number(prod.sale_price ?? prod.price ?? 0);
      costInput.value = resolvedCost > 0 ? resolvedCost.toFixed(2) : '';
      priceInput.value = resolvedPrice > 0 ? resolvedPrice.toFixed(2) : '';
      if (resolvedPrice > 0) {
        manualPriceEdited = true;
      }
      if (originalPriceInput) {
        const origVal = Number(prod.original_price ?? 0);
        originalPriceInput.value = origVal > 0 ? origVal.toFixed(2) : '';
        delete originalPriceInput.dataset.autoFilled;
      }
      stockInput.value = prod.stock ?? prod.stock_qty ?? 0;

      // Aros / Tamanhos (se for anel)
      toggleRingSizes();
      if (prod.sizes) {
        let sizesObj = prod.sizes;
        if (typeof sizesObj === 'string') {
          try {
            sizesObj = JSON.parse(sizesObj);
          } catch (e) {
            sizesObj = {};
          }
        }
        ringSizeInputs.forEach(input => {
          const s = input.dataset.size;
          const parent = input.closest('.ring-size-item');
          if (sizesObj && sizesObj[s] !== undefined && sizesObj[s] !== null) {
            input.value = sizesObj[s];
            if (parseInt(sizesObj[s], 10) > 0 && parent) {
              parent.classList.add('has-stock');
            } else if (parent) {
              parent.classList.remove('has-stock');
            }
          } else {
            input.value = '';
            if (parent) parent.classList.remove('has-stock');
          }
        });
        updateRingStockTotal();
      } else {
        ringSizeInputs.forEach(input => {
          input.value = '';
          const parent = input.closest('.ring-size-item');
          if (parent) parent.classList.remove('has-stock');
        });
      }

      // Imagens (suporta Array nativo, string JSON, formato PostgreSQL text[] e strings avulsas)
      const rawImgs = prod.images ?? prod.image ?? prod.photos ?? prod.image_url ?? prod.fotos;
      let loadedImages = [];
      if (Array.isArray(rawImgs)) {
        loadedImages = rawImgs;
      } else if (typeof rawImgs === 'string') {
        const clean = rawImgs.trim();
        if (clean.startsWith('[') && clean.endsWith(']')) {
          try {
            loadedImages = JSON.parse(clean);
          } catch (e) {
            loadedImages = [];
          }
        } else if (clean.startsWith('{') && clean.endsWith('}')) {
          // Formato PostgreSQL array: {"url1","url2"}
          loadedImages = clean.slice(1, -1)
            .split(',')
            .map(s => s.replace(/^"|"$/g, '').trim())
            .filter(Boolean);
        } else if (clean.length > 0) {
          loadedImages = clean.split(/[\n,]/).map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
        }
      }

      // Caso ainda não tenha carregado e exista imagem singular
      if (loadedImages.length === 0 && (prod.image || prod.image_url)) {
        const single = (prod.image || prod.image_url).toString().trim();
        if (single) loadedImages = [single];
      }

      syncSlotsFromImages(loadedImages);

      // 2. Busca insumos vinculados (product_supplies)
      try {
        const targetId = prod.id || cleanId;
        const authToken = (typeof getAuthToken === 'function' ? getAuthToken() : null) || SUPABASE_ANON_KEY;
        const authHeaders = {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${authToken}`
        };
        let pSupplies = null;

        // Tenta REST direto primeiro
        if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/product_supplies?product_id=eq.${encodeURIComponent(targetId)}&select=id,supply_id,quantity`, {
            headers: authHeaders
          });
          if (res.ok) {
            pSupplies = await res.json();
          }
        }

        // Fallback Supabase Client com timeout
        if (!pSupplies) {
          const client = getDbClient();
          if (client) {
            const queryPromise = client
              .from('product_supplies')
              .select('id, supply_id, quantity')
              .eq('product_id', targetId);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout product_supplies')), 2500));
            const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
            if (!error) pSupplies = data;
          }
        }

        if (Array.isArray(pSupplies) && pSupplies.length > 0) {
          linkedSupplies = [];
          pSupplies.forEach(ps => {
            const sup = availableSupplies.find(s => String(s.id) === String(ps.supply_id));
            if (sup) {
              linkedSupplies.push({
                supply_id: sup.id,
                name: sup.name,
                unit_cost: Number(sup.unit_cost) || 0,
                unit: sup.unit || 'un',
                quantity: Number(ps.quantity) || 1
              });
            }
          });
          renderLinkedSuppliesTable();
        }
      } catch (suppErr) {
        console.warn('Aviso ao buscar insumos vinculados:', suppErr);
      }

      recalculateFinancials();
    } catch (err) {
      console.error('Erro ao carregar dados do produto:', err);
    }
  }

  // ==========================================================================
  // Submissão do Formulário com Confirmação de SKU e Upload Diferido
  // ==========================================================================

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      showToast('Supabase não configurado.', 'error');
      return;
    }

    const currentSku = (skuInput.value.trim() || 'GERAL').toUpperCase();
    if (confirmSkuDisplay) {
      confirmSkuDisplay.textContent = currentSku;
    }

    // Pede confirmação se o SKU está correto antes de salvar
    if (skuConfirmModal) {
      skuConfirmModal.classList.add('active');
    } else {
      executeSaveProduct();
    }
  });

  if (btnCancelSkuConfirm) {
    btnCancelSkuConfirm.addEventListener('click', () => {
      if (skuConfirmModal) skuConfirmModal.classList.remove('active');
      skuInput.focus();
    });
  }

  if (btnProceedSkuConfirm) {
    btnProceedSkuConfirm.addEventListener('click', async () => {
      if (skuConfirmModal) skuConfirmModal.classList.remove('active');
      await executeSaveProduct();
    });
  }

  async function executeSaveProduct() {
    btnSave.disabled = true;
    btnSave.textContent = 'Gravando no Banco...';

    const currentSku = (skuInput.value.trim() || 'GERAL').toUpperCase();

    // 1. Upload diferido das fotos selecionadas diretamente para a pasta do SKU
    if (pendingImageFiles.length > 0) {
      if (uploadProgressModal) uploadProgressModal.classList.add('active');

      const totalFiles = pendingImageFiles.length;
      for (let i = 0; i < totalFiles; i++) {
        const item = pendingImageFiles[i];
        const progressPct = Math.round((i / totalFiles) * 100);

        if (uploadProgressBar) uploadProgressBar.style.width = `${progressPct}%`;
        if (uploadProgressPct) uploadProgressPct.textContent = `${progressPct}%`;
        if (uploadProgressStatus) {
          uploadProgressStatus.textContent = `Enviando foto ${i + 1} de ${totalFiles} para a pasta Fotos Produtos/${currentSku}/...`;
        }

        try {
          const publicUrl = await uploadImageToStorage(item.file, currentSku, 'Fotos Produtos');
          
          // Encontra o primeiro slot livre de foto para atribuir a URL
          let placed = false;
          for (const slot of photoSlots) {
            if (slot && !slot.value.trim()) {
              slot.value = publicUrl;
              placed = true;
              break;
            }
          }
          if (!placed && photoSlots[5]) {
            photoSlots[5].value = publicUrl;
          }
        } catch (uploadErr) {
          console.error('Falha ao enviar foto pendente:', uploadErr);
          showToast(`Erro ao enviar ${item.name}: ${uploadErr.message}`, 'error', 4500);
        }
      }

      if (uploadProgressBar) uploadProgressBar.style.width = '100%';
      if (uploadProgressPct) uploadProgressPct.textContent = '100%';
      if (uploadProgressStatus) uploadProgressStatus.textContent = 'Fotos enviadas com sucesso!';

      // Limpa os arquivos temporários da memória
      pendingImageFiles.forEach(p => URL.revokeObjectURL(p.previewUrl));
      pendingImageFiles = [];
      renderImagePreviews();

      await new Promise(r => setTimeout(r, 400));
      if (uploadProgressModal) uploadProgressModal.classList.remove('active');
    }

    // 2. Monta payload do produto (incluindo grade de aros 10 ao 30 se for anel)
    const isRing = isRingCategory(categoryInput.value);
    const ringSizes = isRing ? getRingSizesData() : {};

    const originalPriceVal = originalPriceInput && parseFloat(originalPriceInput.value) > 0 
      ? parseFloat(originalPriceInput.value) 
      : null;

    const productPayload = {
      name: nameInput.value.trim(),
      status: statusInput.value,
      category: categoryInput.value.trim(),
      sku: currentSku,
      description: descInput.value.trim(),
      product_cost: parseFloat(costInput.value) || 0,
      sale_price: parseFloat(priceInput.value) || 0,
      original_price: originalPriceVal,
      stock: parseInt(stockInput.value, 10) || 0,
      images: getValidImages(),
      sizes: ringSizes
    };

    try {
      const client = getDbClient();
      const authToken = (typeof getAuthToken === 'function' ? getAuthToken() : null) || SUPABASE_ANON_KEY;
      const authHeaders = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${authToken}`
      };

      let savedProductId = productId;

      if (isEditMode) {
        // Atualiza produto (tenta client com timeout, fallback para REST PATCH)
        let updateDone = false;
        if (client) {
          try {
            const queryPromise = client
              .from('products')
              .update(productPayload)
              .eq('id', productId);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout update')), 3500));
            const { error: updateErr } = await Promise.race([queryPromise, timeoutPromise]);
            if (!updateErr) updateDone = true;
          } catch (e) {
            console.warn('Update via client falhou, usando REST PATCH:', e);
          }
        }

        if (!updateDone && typeof SUPABASE_URL !== 'undefined') {
          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            headers: {
              ...authHeaders,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(productPayload)
          });
          if (!patchRes.ok) {
            const txt = await patchRes.text();
            throw new Error(`Erro ao atualizar produto: ${txt}`);
          }
          updateDone = true;
        }

        // Remove vínculos antigos de insumos
        try {
          if (client) {
            await client.from('product_supplies').delete().eq('product_id', productId);
          } else {
            await fetch(`${SUPABASE_URL}/rest/v1/product_supplies?product_id=eq.${encodeURIComponent(productId)}`, {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${authToken}`
              }
            });
          }
        } catch (delErr) {
          console.warn('Aviso ao limpar insumos anteriores:', delErr);
        }

      } else {
        // Cria novo produto (tenta client, fallback para REST POST)
        let insertDone = false;
        if (client) {
          try {
            const queryPromise = client
              .from('products')
              .insert([productPayload])
              .select('id')
              .single();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout insert')), 3500));
            const { data: newProd, error: insertErr } = await Promise.race([queryPromise, timeoutPromise]);
            if (!insertErr && newProd && newProd.id) {
              savedProductId = newProd.id;
              insertDone = true;
            }
          } catch (e) {
            console.warn('Insert via client falhou, usando REST POST:', e);
          }
        }

        if (!insertDone && typeof SUPABASE_URL !== 'undefined') {
          const postRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id`, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify([productPayload])
          });
          if (!postRes.ok) {
            const txt = await postRes.text();
            throw new Error(`Erro ao cadastrar produto: ${txt}`);
          }
          const created = await postRes.json();
          if (Array.isArray(created) && created[0] && created[0].id) {
            savedProductId = created[0].id;
            insertDone = true;
          }
        }
      }

      // Grava os novos vínculos em product_supplies
      if (linkedSupplies.length > 0 && savedProductId) {
        const suppliesPayload = linkedSupplies.map(item => ({
          product_id: savedProductId,
          supply_id: item.supply_id,
          quantity: item.quantity
        }));

        try {
          if (client) {
            const { error: suppInsertErr } = await client
              .from('product_supplies')
              .insert(suppliesPayload);
            if (suppInsertErr) throw suppInsertErr;
          } else {
            await fetch(`${SUPABASE_URL}/rest/v1/product_supplies`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify(suppliesPayload)
            });
          }
        } catch (suppInsertErr) {
          console.error('Erro ao gravar insumos vinculados:', suppInsertErr);
          showToast('Produto salvo, mas houve erro ao registrar insumos: ' + suppInsertErr.message, 'error');
        }
      }

      showToast(isEditMode ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!', 'success');
      
      setTimeout(() => {
        window.location.href = 'admin.html';
      }, 1200);

    } catch (err) {
      console.error('Erro ao salvar produto:', err);
      showToast('Erro ao salvar: ' + err.message, 'error', 5000);
      btnSave.disabled = false;
      btnSave.textContent = isEditMode ? 'Atualizar Produto & Insumos' : 'Salvar Produto & Insumos';
    }
  }

});
