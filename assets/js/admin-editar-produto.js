/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Módulo Dedicado de Edição de Produtos & Composição de Insumos
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Elementos Globais e de Autenticação
  const adminEmailElem = document.getElementById('admin-user-email');
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  // 2. Parâmetro de Identificação da Peça
  const urlParams = new URLSearchParams(window.location.search);
  const productId = (urlParams.get('id') || '').trim();

  // Estados Visuais (Loading, Erro, Formulário)
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const errorTitle = document.getElementById('error-title');
  const errorDesc = document.getElementById('error-desc');
  const form = document.getElementById('product-form');

  // Elementos do Formulário
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const badgeProdSku = document.getElementById('badge-prod-sku');
  const prodIdInput = document.getElementById('prod-id');
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
  const btnSave = document.getElementById('btn-save-product');

  // Grade de Aros
  const ringSizesWrapper = document.getElementById('ring-sizes-wrapper');
  const ringSizeInputs = document.querySelectorAll('.ring-size-input');

  // Fotos e Miniaturas
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
  const imageFileInput = document.getElementById('image-file-input');
  const btnToggleSlots = document.getElementById('btn-toggle-slots');
  const manualUrlSlots = document.getElementById('manual-url-slots');

  // Insumos
  const supplySelect = document.getElementById('supply-select');
  const supplyQtyInput = document.getElementById('supply-qty');
  const btnAddSupply = document.getElementById('btn-add-supply');
  const linkedSuppliesTbody = document.getElementById('linked-supplies-tbody');

  // Engenharia Financeira
  const calcProdCost = document.getElementById('calc-prod-cost');
  const calcSuppliesCost = document.getElementById('calc-supplies-cost');
  const calcTotalCost = document.getElementById('calc-total-cost');
  const calcSalePrice = document.getElementById('calc-sale-price');
  const calcUnitProfit = document.getElementById('calc-unit-profit');
  const btnRecalc300 = document.getElementById('btn-recalc-300');

  // Modal de Upload
  const uploadProgressModal = document.getElementById('upload-progress-modal');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadProgressPct = document.getElementById('upload-progress-pct');
  const uploadProgressStatus = document.getElementById('upload-progress-status');

  // Estado Local
  let availableSupplies = [];
  let linkedSupplies = []; // [{ supply_id, name, unit_cost, unit, quantity }]
  let pendingImageFiles = []; // [{ file, previewUrl, name }]
  let currentImages = [];

  // ==========================================================================
  // 1. Verificação de ID e Inicialização
  // ==========================================================================

  if (!productId) {
    showError('Nenhum identificador informado', 'Por favor, retorne ao painel de estoque e selecione o produto que deseja editar.');
    return;
  }

  // Atualiza operador imediatamente a partir da sessão
  getCurrentUser().then(user => {
    if (adminEmailElem && user && user.email) {
      adminEmailElem.textContent = user.email;
    }
  }).catch(() => {});

  // Inicia carregamento
  initPageData();

  async function initPageData() {
    try {
      // 1. Carrega insumos disponíveis primeiro (para vincular nomes e custos unitários)
      await loadAvailableSupplies();

      // 2. Carrega produto do banco
      const prod = await fetchProductWithFallback(productId);

      if (!prod) {
        showError('Produto não localizado', `Não foi possível encontrar a peça com o ID "${productId}". Ela pode ter sido removida.`);
        return;
      }

      // 3. Preenche formulário com os dados carregados
      populateForm(prod);

      // 4. Carrega insumos vinculados ao produto
      await loadLinkedSupplies(prod.id || productId);

      // 5. Exibe o formulário
      if (loadingState) loadingState.style.display = 'none';
      if (form) form.style.display = 'block';

      // Atualiza cálculos
      recalculateFinancials();

    } catch (err) {
      console.error('Falha ao inicializar dados:', err);
      showError('Falha de Comunicação', 'Houve um erro ao buscar os dados da joia no Supabase: ' + (err.message || err));
    }
  }

  // ==========================================================================
  // 2. Fetch Inteligente com Dupla Contingência (Token + Chave Pública Anon)
  // ==========================================================================

  async function fetchProductWithFallback(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);

    // Tentativa 1: Via REST direto com Token (se disponível) ou Chave Pública
    try {
      let headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      };

      let endpoint = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(cleanId)}&select=*`;
      let res = await fetch(endpoint, { headers });

      // Se der 401 Unauthorized (token expirado), tenta imediatamente com a chave pública
      if (res.status === 401 || res.status === 403) {
        headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
        res = await fetch(endpoint, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (item && item.id) return item;
      }

      // Se não encontrou por ID, tenta por SKU
      let skuEndpoint = `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(cleanId)}&select=*`;
      let resSku = await fetch(skuEndpoint, { headers });
      if (resSku.ok) {
        const dataSku = await resSku.json();
        const itemSku = Array.isArray(dataSku) ? dataSku[0] : dataSku;
        if (itemSku && itemSku.id) return itemSku;
      }
    } catch (e) {
      console.warn('REST direto falhou, tentando cliente JS:', e);
    }

    // Tentativa 2: Fallback via cliente Supabase JS (com timeout protetor de 2.5s)
    try {
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
      if (client) {
        const queryPromise = (async () => {
          let { data } = await client.from('products').select('*').eq('id', cleanId).maybeSingle();
          if (data) return data;
          let { data: bySku } = await client.from('products').select('*').eq('sku', cleanId).maybeSingle();
          return bySku;
        })();

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Client')), 2500));
        const result = await Promise.race([queryPromise, timeoutPromise]);
        if (result) return result;
      }
    } catch (e) {
      console.warn('Cliente Supabase falhou:', e);
    }

    return null;
  }

  // ==========================================================================
  // 3. Preenchimento de Campos do Formulário
  // ==========================================================================

  function populateForm(prod) {
    if (prodIdInput) prodIdInput.value = prod.id || productId;
    if (nameInput) nameInput.value = prod.name || '';
    if (statusInput) statusInput.value = prod.status || 'ativo';
    if (categoryInput) categoryInput.value = prod.category || '';
    if (skuInput) skuInput.value = prod.sku || '';

    if (badgeProdSku && prod.sku) {
      badgeProdSku.textContent = prod.sku;
      badgeProdSku.style.display = 'inline-block';
    }

    if (pageSubtitle && prod.name) {
      pageSubtitle.textContent = `Editando peça: "${prod.name}"`;
    }

    if (descInput) {
      descInput.value = prod.description ?? prod.desc ?? prod.descricao ?? '';
    }

    // Custos e Preços
    const resolvedCost = Number(prod.product_cost ?? prod.cost ?? prod.cost_price ?? 0);
    const resolvedPrice = Number(prod.sale_price ?? prod.price ?? 0);
    const resolvedOriginalPrice = Number(prod.original_price ?? 0);

    if (costInput) costInput.value = resolvedCost > 0 ? resolvedCost.toFixed(2) : '';
    if (priceInput) priceInput.value = resolvedPrice > 0 ? resolvedPrice.toFixed(2) : '';
    if (originalPriceInput) originalPriceInput.value = resolvedOriginalPrice > 0 ? resolvedOriginalPrice.toFixed(2) : '';
    if (stockInput) stockInput.value = prod.stock ?? prod.stock_qty ?? 0;

    // Grade de Aros (se categoria for Anel)
    toggleRingSizes();
    if (prod.sizes) {
      let sizesObj = prod.sizes;
      if (typeof sizesObj === 'string') {
        try { sizesObj = JSON.parse(sizesObj); } catch (e) { sizesObj = {}; }
      }
      ringSizeInputs.forEach(input => {
        const s = input.dataset.size;
        const parent = input.closest('.ring-size-item');
        if (sizesObj && sizesObj[s] !== undefined && sizesObj[s] !== null) {
          input.value = sizesObj[s];
          if (parseInt(sizesObj[s], 10) > 0 && parent) parent.classList.add('has-stock');
          else if (parent) parent.classList.remove('has-stock');
        } else {
          input.value = '';
          if (parent) parent.classList.remove('has-stock');
        }
      });
      updateRingStockTotal();
    }

    // Fotos do Produto
    const rawImgs = prod.images ?? prod.image ?? prod.photos ?? prod.image_url;
    let loadedImages = [];
    if (Array.isArray(rawImgs)) {
      loadedImages = rawImgs;
    } else if (typeof rawImgs === 'string') {
      const clean = rawImgs.trim();
      if (clean.startsWith('[') && clean.endsWith(']')) {
        try { loadedImages = JSON.parse(clean); } catch (e) { loadedImages = []; }
      } else if (clean.startsWith('{') && clean.endsWith('}')) {
        loadedImages = clean.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      } else if (clean.length > 0) {
        loadedImages = clean.split(/[\n,]/).map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
    }
    syncSlotsFromImages(loadedImages);
  }

  // ==========================================================================
  // 4. Insumos Cadastrados e Vinculados
  // ==========================================================================

  async function loadAvailableSupplies() {
    try {
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      let headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      };

      let res = await fetch(`${SUPABASE_URL}/rest/v1/supplies?select=*&order=name.asc`, { headers });
      if (res.status === 401 || res.status === 403) {
        headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
        res = await fetch(`${SUPABASE_URL}/rest/v1/supplies?select=*&order=name.asc`, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        availableSupplies = Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.warn('Erro ao carregar insumos:', e);
    }

    // Preenche select
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
  }

  async function loadLinkedSupplies(targetId) {
    try {
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      let headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      };

      let res = await fetch(`${SUPABASE_URL}/rest/v1/product_supplies?product_id=eq.${encodeURIComponent(targetId)}&select=id,supply_id,quantity`, { headers });
      if (res.status === 401 || res.status === 403) {
        headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
        res = await fetch(`${SUPABASE_URL}/rest/v1/product_supplies?product_id=eq.${encodeURIComponent(targetId)}&select=id,supply_id,quantity`, { headers });
      }

      if (res.ok) {
        const pSupplies = await res.json();
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
      }
    } catch (e) {
      console.warn('Erro ao carregar vínculos de insumos:', e);
    }
  }

  function renderLinkedSuppliesTable() {
    if (!linkedSuppliesTbody) return;
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
        <td style="text-align: right;" class="val-currency">${formatBRL(item.unit_cost)}</td>
        <td style="text-align: center;">${item.quantity} ${item.unit}</td>
        <td style="text-align: right; font-weight: 600;" class="val-currency">${formatBRL(subtotal)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-remove-supply" data-index="${index}" style="background: none; border: none; color: #E53E3E; cursor: pointer; font-size: 1.1rem; padding: 0.2rem 0.5rem;" title="Remover este insumo">&times;</button>
        </td>
      `;
      linkedSuppliesTbody.appendChild(tr);
    });

    // Eventos de exclusão
    linkedSuppliesTbody.querySelectorAll('.btn-remove-supply').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        if (!isNaN(idx)) {
          linkedSupplies.splice(idx, 1);
          renderLinkedSuppliesTable();
        }
      });
    });

    recalculateFinancials();
  }

  if (btnAddSupply) {
    btnAddSupply.addEventListener('click', () => {
      const selectedId = supplySelect.value;
      const qty = parseFloat(supplyQtyInput.value);

      if (!selectedId) {
        showToast('Selecione um insumo cadastrado na lista.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        showToast('Informe uma quantidade válida superior a zero.', 'error');
        return;
      }

      const sup = availableSupplies.find(s => String(s.id) === String(selectedId));
      if (!sup) return;

      const existing = linkedSupplies.find(s => String(s.supply_id) === String(selectedId));
      if (existing) {
        existing.quantity += qty;
      } else {
        linkedSupplies.push({
          supply_id: sup.id,
          name: sup.name,
          unit_cost: Number(sup.unit_cost) || 0,
          unit: sup.unit || 'un',
          quantity: qty
        });
      }

      supplySelect.value = '';
      supplyQtyInput.value = '1';
      renderLinkedSuppliesTable();
      showToast(`Insumo "${sup.name}" vinculado à peça!`, 'success', 2500);
    });
  }

  // ==========================================================================
  // 5. Grade de Aros & Cálculo de Estoque
  // ==========================================================================

  function isRingCategory(cat) {
    if (!cat) return false;
    const clean = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return clean.includes('anel') || clean.includes('aneis');
  }

  function toggleRingSizes() {
    if (!ringSizesWrapper) return;
    if (isRingCategory(categoryInput.value)) {
      ringSizesWrapper.style.display = 'block';
      if (stockHelpText) stockHelpText.textContent = 'Somado automaticamente a partir da grade de aros';
    } else {
      ringSizesWrapper.style.display = 'none';
      if (stockHelpText) stockHelpText.textContent = 'Unidades totais disponíveis';
    }
  }

  function updateRingStockTotal() {
    let totalStock = 0;
    ringSizeInputs.forEach(input => {
      const qty = parseInt(input.value, 10);
      const parent = input.closest('.ring-size-item');
      if (!isNaN(qty) && qty > 0) {
        totalStock += qty;
        if (parent) parent.classList.add('has-stock');
      } else {
        if (parent) parent.classList.remove('has-stock');
      }
    });

    if (isRingCategory(categoryInput.value) && stockInput) {
      stockInput.value = totalStock;
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

  ringSizeInputs.forEach(input => input.addEventListener('input', updateRingStockTotal));
  if (categoryInput) {
    categoryInput.addEventListener('input', toggleRingSizes);
    categoryInput.addEventListener('change', toggleRingSizes);
  }

  // ==========================================================================
  // 6. Engenharia de Lucro em Tempo Real & Markup
  // ==========================================================================

  function recalculateFinancials() {
    const prodCost = parseFloat(costInput ? costInput.value : 0) || 0;
    const suppliesCost = linkedSupplies.reduce((acc, item) => acc + (item.unit_cost * item.quantity), 0);
    const totalCost = prodCost + suppliesCost;
    const salePrice = parseFloat(priceInput ? priceInput.value : 0) || 0;
    const unitProfit = salePrice - totalCost;

    if (calcProdCost) calcProdCost.textContent = formatBRL(prodCost);
    if (calcSuppliesCost) calcSuppliesCost.textContent = formatBRL(suppliesCost);
    if (calcTotalCost) calcTotalCost.textContent = formatBRL(totalCost);
    if (calcSalePrice) calcSalePrice.textContent = formatBRL(salePrice);

    if (calcUnitProfit) {
      calcUnitProfit.textContent = formatBRL(unitProfit);
      if (unitProfit < 0) {
        calcUnitProfit.classList.remove('highlight-green');
        calcUnitProfit.classList.add('highlight-red');
      } else {
        calcUnitProfit.classList.remove('highlight-red');
        calcUnitProfit.classList.add('highlight-green');
      }
    }
  }

  if (costInput) costInput.addEventListener('input', recalculateFinancials);
  if (priceInput) priceInput.addEventListener('input', recalculateFinancials);

  if (btnRecalc300) {
    btnRecalc300.addEventListener('click', () => {
      const prodCost = parseFloat(costInput.value) || 0;
      const suppliesCost = linkedSupplies.reduce((acc, item) => acc + (item.unit_cost * item.quantity), 0);
      const totalCost = prodCost + suppliesCost;

      if (totalCost <= 0) {
        showToast('Informe o custo do produto ou insumos para sugerir o markup.', 'error');
        return;
      }

      // Sugestão de 300% de markup (Custo total x 4)
      const suggestedPrice = Math.ceil(totalCost * 4) - 0.10;
      priceInput.value = suggestedPrice.toFixed(2);
      recalculateFinancials();
      showToast(`Preço sugerido a 300% de markup: ${formatBRL(suggestedPrice)}`, 'success', 3000);
    });
  }

  // ==========================================================================
  // 7. Galeria de Fotos e Miniaturas
  // ==========================================================================

  function isValidImageUrl(val) {
    if (!val || typeof val !== 'string') return false;
    const v = val.trim();
    return v.startsWith('http://') || 
           v.startsWith('https://') || 
           v.startsWith('data:image/') ||
           v.startsWith('assets/');
  }

  function getValidImages() {
    const list = [];
    photoSlots.forEach(slot => {
      if (slot && isValidImageUrl(slot.value)) {
        list.push(slot.value.trim());
      }
    });
    return list;
  }

  function syncSlotsFromImages(imagesList) {
    const list = Array.isArray(imagesList) ? imagesList.slice(0, 6) : [];
    photoSlots.forEach((slot, idx) => {
      if (slot) slot.value = list[idx] || '';
    });
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const validImages = getValidImages();
    currentImages = validImages;
    const totalCount = validImages.length + pendingImageFiles.length;

    if (imgCountBadge) imgCountBadge.textContent = totalCount;
    if (!imagePreviewsContainer) return;
    imagePreviewsContainer.innerHTML = '';

    // Renderiza fotos existentes
    validImages.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.innerHTML = `
        <img src="${url}" alt="Foto ${idx + 1}" loading="lazy" onerror="this.src='assets/images/logo-simbolo.png'">
        <span class="preview-badge ${idx === 0 ? 'badge-cover' : ''}">${idx === 0 ? 'Capa' : '#' + (idx + 1)}</span>
        <button type="button" class="btn-remove-preview" title="Remover imagem">&times;</button>
      `;
      item.querySelector('.btn-remove-preview').addEventListener('click', (e) => {
        e.stopPropagation();
        removePhotoAt(idx);
      });
      imagePreviewsContainer.appendChild(item);
    });

    // Renderiza fotos novas pendentes de envio
    pendingImageFiles.forEach((p, pIdx) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.style.border = '2px dashed var(--gold-primary)';
      item.innerHTML = `
        <img src="${p.previewUrl}" alt="${p.name}">
        <span class="preview-badge" style="background: var(--brand-terracotta); color: #fff;">Novo</span>
        <button type="button" class="btn-remove-preview" title="Remover foto pendente">&times;</button>
      `;
      item.querySelector('.btn-remove-preview').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(p.previewUrl);
        pendingImageFiles.splice(pIdx, 1);
        renderImagePreviews();
      });
      imagePreviewsContainer.appendChild(item);
    });
  }

  function removePhotoAt(idx) {
    if (photoSlots[idx]) photoSlots[idx].value = '';
    // Compacta slots
    const remaining = getValidImages();
    photoSlots.forEach((slot, i) => {
      if (slot) slot.value = remaining[i] || '';
    });
    renderImagePreviews();
  }

  if (btnToggleSlots && manualUrlSlots) {
    btnToggleSlots.addEventListener('click', () => {
      const isHidden = manualUrlSlots.style.display === 'none';
      manualUrlSlots.style.display = isHidden ? 'block' : 'none';
      btnToggleSlots.textContent = isHidden ? 'Ocultar Links Manuais' : 'Editar Links Manuais';
    });
  }

  photoSlots.forEach(slot => {
    if (slot) slot.addEventListener('input', renderImagePreviews);
  });

  if (imageFileInput) {
    imageFileInput.addEventListener('change', () => {
      const files = Array.from(imageFileInput.files || []);
      if (!files.length) return;

      const currentTotal = getValidImages().length + pendingImageFiles.length;
      const available = 6 - currentTotal;

      if (available <= 0) {
        showToast('Limite máximo de 6 fotos já atingido.', 'error');
        imageFileInput.value = '';
        return;
      }

      files.slice(0, available).forEach(file => {
        pendingImageFiles.push({
          file,
          previewUrl: URL.createObjectURL(file),
          name: file.name
        });
      });

      renderImagePreviews();
      showToast(`${files.slice(0, available).length} foto(s) pronta(s). Clique em "Salvar Alterações" para confirmar.`, 'info', 3500);
      imageFileInput.value = '';
    });
  }

  // ==========================================================================
  // 8. Salvamento das Alterações
  // ==========================================================================

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      showToast('Configuração do Supabase ausente.', 'error');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Salvando Alterações...';

    const currentSku = (skuInput.value.trim() || 'GERAL').toUpperCase();

    // 1. Upload de novas fotos pendentes para o Storage
    if (pendingImageFiles.length > 0) {
      if (uploadProgressModal) uploadProgressModal.classList.add('active');

      const totalFiles = pendingImageFiles.length;
      for (let i = 0; i < totalFiles; i++) {
        const item = pendingImageFiles[i];
        const pct = Math.round((i / totalFiles) * 100);

        if (uploadProgressBar) uploadProgressBar.style.width = `${pct}%`;
        if (uploadProgressPct) uploadProgressPct.textContent = `${pct}%`;
        if (uploadProgressStatus) uploadProgressStatus.textContent = `Enviando foto ${i + 1} de ${totalFiles}...`;

        try {
          const publicUrl = await uploadImageToStorage(item.file, currentSku, 'Fotos Produtos');
          // Encontra primeiro slot livre
          for (const slot of photoSlots) {
            if (slot && !slot.value.trim()) {
              slot.value = publicUrl;
              break;
            }
          }
        } catch (uploadErr) {
          console.error('Falha ao enviar imagem:', uploadErr);
          showToast(`Erro ao enviar foto: ${uploadErr.message}`, 'error', 4500);
        }
      }

      if (uploadProgressBar) uploadProgressBar.style.width = '100%';
      if (uploadProgressPct) uploadProgressPct.textContent = '100%';
      pendingImageFiles.forEach(p => URL.revokeObjectURL(p.previewUrl));
      pendingImageFiles = [];
      renderImagePreviews();

      await new Promise(r => setTimeout(r, 400));
      if (uploadProgressModal) uploadProgressModal.classList.remove('active');
    }

    // 2. Monta payload da peça
    const isRing = isRingCategory(categoryInput.value);
    const ringSizes = isRing ? getRingSizesData() : {};
    const origPriceVal = originalPriceInput && parseFloat(originalPriceInput.value) > 0 
      ? parseFloat(originalPriceInput.value) 
      : null;

    const payload = {
      name: nameInput.value.trim(),
      status: statusInput.value,
      category: categoryInput.value.trim(),
      sku: currentSku,
      description: descInput.value.trim(),
      product_cost: parseFloat(costInput.value) || 0,
      sale_price: parseFloat(priceInput.value) || 0,
      original_price: origPriceVal,
      stock: parseInt(stockInput.value, 10) || 0,
      images: getValidImages(),
      sizes: ringSizes
    };

    try {
      const targetId = prodIdInput.value || productId;
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      let authHeaders = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      };

      // Tenta atualização via REST PATCH direto
      let patchRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      // Se der 401 por token expirado, tenta com a chave de emergência
      if (patchRes.status === 401 || patchRes.status === 403) {
        authHeaders['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
        patchRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(targetId)}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify(payload)
        });
      }

      if (!patchRes.ok) {
        // Fallback para cliente Supabase JS
        const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
        if (client) {
          const { error: updErr } = await client.from('products').update(payload).eq('id', targetId);
          if (updErr) throw updErr;
        } else {
          const errTxt = await patchRes.text();
          throw new Error(`Falha ao salvar produto (${patchRes.status}): ${errTxt}`);
        }
      }

      // Atualiza vínculos em product_supplies
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/product_supplies?product_id=eq.${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
          headers: authHeaders
        });

        if (linkedSupplies.length > 0) {
          const suppliesPayload = linkedSupplies.map(item => ({
            product_id: targetId,
            supply_id: item.supply_id,
            quantity: item.quantity
          }));

          await fetch(`${SUPABASE_URL}/rest/v1/product_supplies`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(suppliesPayload)
          });
        }
      } catch (suppErr) {
        console.warn('Aviso ao sincronizar insumos:', suppErr);
      }

      showToast('Produto e insumos atualizados com sucesso!', 'success', 3000);

      setTimeout(() => {
        window.location.href = 'admin.html';
      }, 1200);

    } catch (saveErr) {
      console.error('Erro ao salvar produto:', saveErr);
      showToast('Erro ao gravar dados: ' + saveErr.message, 'error', 5000);
      btnSave.disabled = false;
      btnSave.textContent = 'Salvar Alterações';
    }
  });

  // ==========================================================================
  // 9. Helpers de Estado de Erro
  // ==========================================================================

  function showError(title, message) {
    if (loadingState) loadingState.style.display = 'none';
    if (form) form.style.display = 'none';
    if (errorState) {
      if (errorTitle) errorTitle.textContent = title;
      if (errorDesc) errorDesc.textContent = message;
      errorState.style.display = 'block';
    }
  }

});
