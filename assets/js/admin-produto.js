/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Módulo Dedicado de Cadastro de Novos Produtos & Insumos
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Elementos Globais e de Autenticação
  const adminEmailElem = document.getElementById('admin-user-email');
  const btnLogout = document.getElementById('btn-logout');
  const authWarningBox = document.getElementById('auth-warning-box');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  // Redirecionamento se acidentalmente chamada com ?id= (para editar)
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('id');
  if (editId) {
    window.location.replace(`admin-editar-produto.html?id=${encodeURIComponent(editId)}`);
    return;
  }

  // 2. Elementos do Formulário
  const form = document.getElementById('product-form');
  const btnSave = document.getElementById('btn-save-product');
  const badgeSkuPreview = document.getElementById('badge-sku-preview');

  const nameInput = document.getElementById('prod-name');
  const statusInput = document.getElementById('prod-status');
  const categoryInput = document.getElementById('prod-category');
  const skuInput = document.getElementById('prod-sku');
  const skuStatusFeedback = document.getElementById('sku-status-feedback');
  const btnGenerateSku = document.getElementById('btn-generate-sku');
  const descInput = document.getElementById('prod-description');

  // Precificação e Estoque
  const costInput = document.getElementById('prod-cost');
  const priceInput = document.getElementById('prod-price');
  const originalPriceInput = document.getElementById('prod-original-price');
  const stockInput = document.getElementById('prod-stock');
  const stockHelpText = document.getElementById('stock-help-text');
  const btnRecalc300 = document.getElementById('btn-recalc-300');

  // Grade de Aros
  const ringSizesWrapper = document.getElementById('ring-sizes-wrapper');
  const ringSizeInputs = document.querySelectorAll('.ring-size-input');
  const btnClearSizes = document.getElementById('btn-clear-sizes');

  // Imagens e Upload
  const imageFileInput = document.getElementById('image-file-input');
  const uploadZone = document.getElementById('upload-zone');
  const imagePreviewsContainer = document.getElementById('image-previews');
  const imgCountBadge = document.getElementById('img-count-badge');
  const btnToggleSlots = document.getElementById('btn-toggle-slots');
  const manualUrlSlots = document.getElementById('manual-url-slots');
  const photoSlots = [
    document.getElementById('prod-img-1'),
    document.getElementById('prod-img-2'),
    document.getElementById('prod-img-3'),
    document.getElementById('prod-img-4'),
    document.getElementById('prod-img-5'),
    document.getElementById('prod-img-6')
  ];

  // Insumos
  const supplySelect = document.getElementById('supply-select');
  const supplyQtyInput = document.getElementById('supply-qty');
  const btnAddSupply = document.getElementById('btn-add-supply');
  const linkedSuppliesTbody = document.getElementById('linked-supplies-tbody');

  // Calculadora Financeira
  const calcProdCost = document.getElementById('calc-prod-cost');
  const calcSuppliesCost = document.getElementById('calc-supplies-cost');
  const calcTotalCost = document.getElementById('calc-total-cost');
  const calcSalePrice = document.getElementById('calc-sale-price');
  const calcUnitProfit = document.getElementById('calc-unit-profit');

  // Modais
  const uploadProgressModal = document.getElementById('upload-progress-modal');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadProgressPct = document.getElementById('upload-progress-pct');
  const uploadProgressStatus = document.getElementById('upload-progress-status');

  const successModal = document.getElementById('success-modal');
  const successModalDesc = document.getElementById('success-modal-desc');
  const btnModalAddAnother = document.getElementById('btn-modal-add-another');

  // Estado Local
  let availableSupplies = [];
  let linkedSupplies = []; // [{ supply_id, name, unit_cost, unit, quantity }]
  let pendingImageFiles = []; // [{ file, previewUrl, name }]
  let manualPriceEdited = false;
  let existingProductsCatalog = []; // [{ sku, category }]

  // ==========================================================================
  // Helper: Obter cliente do Supabase
  // ==========================================================================
  function getDb() {
    if (typeof getSupabaseClient === 'function') {
      const c = getSupabaseClient();
      if (c) return c;
    }
    if (typeof db !== 'undefined' && db) return db;
    if (typeof window !== 'undefined' && window.db) return window.db;
    if (typeof window !== 'undefined' && window.supabase && typeof SUPABASE_URL !== 'undefined') {
      const c = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.db = c;
      return c;
    }
    return null;
  }

  // ==========================================================================
  // 1. Inicialização de Sessão e Dados
  // ==========================================================================
  async function init() {
    // 1.1 Checa usuário autenticado
    try {
      const user = await getCurrentUser();
      if (user && user.email) {
        if (adminEmailElem) adminEmailElem.textContent = user.email;
        if (authWarningBox) authWarningBox.style.display = 'none';
      } else {
        if (adminEmailElem) adminEmailElem.textContent = 'Painel Soléria';
        if (authWarningBox) authWarningBox.style.display = 'flex';
      }
    } catch (e) {
      if (adminEmailElem) adminEmailElem.textContent = 'Painel Soléria';
      if (authWarningBox) authWarningBox.style.display = 'flex';
    }

    // 1.2 Carrega catálogo existente de SKUs para geração inteligente sem colisões
    loadExistingCatalogSkus();

    // 1.3 Carrega insumos disponíveis
    loadAvailableSupplies();

    // 1.4 Renderiza miniaturas iniciais e cálculos
    renderImagePreviews();
    recalculateFinancials();
  }

  init();

  // ==========================================================================
  // 2. Geração Inteligente de SKU sem Colisões
  // ==========================================================================
  async function loadExistingCatalogSkus() {
    try {
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      };

      if (typeof SUPABASE_URL !== 'undefined') {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=sku,category`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            existingProductsCatalog = data;
            // Se SKU estiver vazio e houver categoria preenchida, gera
            if (!skuInput.value.trim()) {
              generateNextSku();
            }
            return;
          }
        }
      }

      const client = getDb();
      if (client) {
        const { data } = await client.from('products').select('sku, category');
        if (data && Array.isArray(data)) {
          existingProductsCatalog = data;
          if (!skuInput.value.trim()) {
            generateNextSku();
          }
        }
      }
    } catch (err) {
      console.warn('Aviso ao carregar SKUs existentes:', err);
    }
  }

  function getCategoryPrefix(categoryName) {
    const clean = (categoryName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (clean.includes('anel') || clean.includes('aneis')) return 'AN';
    if (clean.includes('brinco')) return 'BRI';
    if (clean.includes('colar') || clean.includes('gargantilha') || clean.includes('choker')) return 'COL';
    if (clean.includes('pulseira') || clean.includes('tornozeleira')) return 'PUL';
    if (clean.includes('bracelete')) return 'BRA';
    if (clean.includes('conjunto')) return 'CEB';
    if (clean.includes('pingente')) return 'PNG';
    if (clean.includes('relogio')) return 'REL';
    
    // Fallback: 3 primeiras letras
    const raw = (categoryName || 'SLR').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return raw.length >= 3 ? raw.substring(0, 3) : raw.padEnd(3, 'X');
  }

  function generateNextSku() {
    const cat = categoryInput.value.trim() || 'Geral';
    const prefix = getCategoryPrefix(cat);

    let maxNum = 0;
    const regexPattern = new RegExp(`^${prefix}[-_]?([0-9]+)`, 'i');

    existingProductsCatalog.forEach(p => {
      const s = (p.sku || '').trim().toUpperCase();
      const match = s.match(regexPattern);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    let nextSku = '';
    if (maxNum > 0) {
      nextSku = `${prefix}${maxNum + 1}`;
    } else {
      // Se ainda não encontrou nenhuma sequência com esse prefixo, usa 5001 ou 0001
      if (prefix === 'AN') nextSku = 'AN5250';
      else if (prefix === 'BRI') nextSku = 'BRI24900';
      else if (prefix === 'COL') nextSku = 'COL16900';
      else if (prefix === 'PUL') nextSku = 'PUL8300';
      else if (prefix === 'CEB') nextSku = 'CEB6700';
      else if (prefix === 'BRA') nextSku = 'BRA4300';
      else nextSku = `${prefix}-0001`;
    }

    skuInput.value = nextSku;
    validateSkuUniqueness();
    updateSkuBadge(nextSku);
  }

  function validateSkuUniqueness() {
    const val = (skuInput.value || '').trim().toUpperCase();
    if (!val) {
      skuStatusFeedback.textContent = '';
      return true;
    }

    const exists = existingProductsCatalog.some(p => (p.sku || '').trim().toUpperCase() === val);
    if (exists) {
      skuStatusFeedback.textContent = '⚠️ Já existe';
      skuStatusFeedback.style.color = '#DC2626';
      return false;
    } else {
      skuStatusFeedback.textContent = '✓ Disponível';
      skuStatusFeedback.style.color = '#10B981';
      return true;
    }
  }

  function updateSkuBadge(sku) {
    if (badgeSkuPreview) {
      if (sku) {
        badgeSkuPreview.textContent = sku;
        badgeSkuPreview.style.display = 'inline-block';
      } else {
        badgeSkuPreview.style.display = 'none';
      }
    }
  }

  if (btnGenerateSku) {
    btnGenerateSku.addEventListener('click', (e) => {
      e.preventDefault();
      generateNextSku();
      showToast('Novo código SKU sugerido!', 'info', 2500);
    });
  }

  skuInput.addEventListener('input', () => {
    skuInput.value = skuInput.value.toUpperCase();
    validateSkuUniqueness();
    updateSkuBadge(skuInput.value.trim());
  });

  skuInput.addEventListener('blur', () => {
    validateSkuUniqueness();
  });

  categoryInput.addEventListener('change', () => {
    toggleRingSizes();
    if (!skuInput.value.trim() || skuInput.value.startsWith('SLR') || skuInput.value.includes('-0001')) {
      generateNextSku();
    }
  });

  categoryInput.addEventListener('input', () => {
    toggleRingSizes();
  });

  // ==========================================================================
  // 3. Gerenciamento Especial de Grade de Aros (Anéis)
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
        if (stockHelpText) stockHelpText.textContent = 'Calculado automaticamente a partir da grade de aros';
        stockInput.readOnly = true;
        stockInput.style.backgroundColor = 'var(--bg-surface-alt)';
        updateRingStockTotal();
      } else {
        ringSizesWrapper.style.display = 'none';
        if (stockHelpText) stockHelpText.textContent = 'Unidades totais disponíveis no catálogo';
        stockInput.readOnly = false;
        stockInput.style.backgroundColor = '';
      }
    }
  }

  function updateRingStockTotal() {
    if (!isRingCategory(categoryInput.value)) return;
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
    stockInput.value = totalStock;
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

  if (btnClearSizes) {
    btnClearSizes.addEventListener('click', (e) => {
      e.preventDefault();
      ringSizeInputs.forEach(input => {
        input.value = '';
        const parent = input.closest('.ring-size-item');
        if (parent) parent.classList.remove('has-stock');
      });
      updateRingStockTotal();
    });
  }

  // ==========================================================================
  // 4. Gerenciamento de Imagens (Upload e Slots Manuais)
  // ==========================================================================
  function isValidImageUrl(val) {
    if (!val || typeof val !== 'string') return false;
    const v = val.trim();
    if (!v) return false;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/') || v.startsWith('blob:') || v.startsWith('/') || v.startsWith('./') || v.startsWith('assets/')) {
      return true;
    }
    return /\.(jpg|jpeg|png|webp|avif|gif|svg)(\?.*)?$/i.test(v) || v.includes('supabase.co');
  }

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

  function syncSlotsFromImages(imagesList) {
    const list = Array.isArray(imagesList) ? imagesList.slice(0, 6) : [];
    photoSlots.forEach((slot, idx) => {
      if (slot) slot.value = list[idx] || '';
    });
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const validUrls = getValidImages();
    const totalCount = validUrls.length + pendingImageFiles.length;

    if (imgCountBadge) imgCountBadge.textContent = totalCount;
    imagePreviewsContainer.innerHTML = '';

    if (totalCount === 0) {
      imagePreviewsContainer.innerHTML = `
        <div style="font-size: 0.82rem; color: var(--text-muted); font-style: italic; padding: 0.75rem 0; width: 100%;">
          Nenhuma foto adicionada ainda. Arraste arquivos na caixa acima ou cole links diretos em "Alternar Links Manuais".
        </div>
      `;
      return;
    }

    // 1. Fotos já existentes com URL direta
    validUrls.forEach((url, idx) => {
      const card = document.createElement('div');
      card.className = 'image-preview-card';
      card.innerHTML = `
        <div class="image-preview-thumb">
          <img src="${url}" alt="Foto ${idx + 1}" onerror="this.onerror=null; this.src='assets/images/logo-simbolo.png';">
          ${idx === 0 && pendingImageFiles.length === 0 ? '<span class="image-preview-badge" style="background: var(--gold-primary); color: #181614;">Capa Oficial</span>' : ''}
          <button type="button" class="image-preview-remove btn-remove-saved" data-index="${idx}" title="Remover esta foto">&times;</button>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-secondary); text-align: center; margin-top: 0.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          Foto ${idx + 1}
        </div>
      `;
      imagePreviewsContainer.appendChild(card);
    });

    // 2. Fotos locais pendentes de upload
    pendingImageFiles.forEach((p, pIdx) => {
      const isCover = validUrls.length === 0 && pIdx === 0;
      const card = document.createElement('div');
      card.className = 'image-preview-card';
      card.innerHTML = `
        <div class="image-preview-thumb">
          <img src="${p.previewUrl}" alt="${p.name}">
          <span class="image-preview-badge" style="background: #B45309; color: #FFFFFF;">
            ${isCover ? 'Capa (Upload)' : 'Envio Pendente'}
          </span>
          <button type="button" class="image-preview-remove btn-remove-pending" data-pindex="${pIdx}" title="Remover foto">&times;</button>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-secondary); text-align: center; margin-top: 0.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${p.name}
        </div>
      `;
      imagePreviewsContainer.appendChild(card);
    });

    // Handlers de remoção
    imagePreviewsContainer.querySelectorAll('.btn-remove-saved').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        const updated = getValidImages();
        updated.splice(index, 1);
        syncSlotsFromImages(updated);
      });
    });

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

  // Toggle do bloco de URLs manuais
  if (btnToggleSlots && manualUrlSlots) {
    btnToggleSlots.addEventListener('click', () => {
      const isHidden = manualUrlSlots.style.display === 'none' || !manualUrlSlots.style.display;
      manualUrlSlots.style.display = isHidden ? 'block' : 'none';
      btnToggleSlots.textContent = isHidden ? 'Ocultar Links Manuais' : 'Alternar Links Manuais de URL';
    });
  }

  // Monitora alterações nos slots manuais
  photoSlots.forEach(slot => {
    if (!slot) return;
    ['input', 'change', 'paste'].forEach(evt => {
      slot.addEventListener(evt, () => setTimeout(renderImagePreviews, 50));
    });
  });

  // Upload e Seleção de Arquivos
  if (imageFileInput) {
    imageFileInput.addEventListener('click', (e) => e.stopPropagation());
    imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        bufferFilesForUpload(e.target.files);
      }
    });
  }

  if (uploadZone) {
    uploadZone.addEventListener('click', (e) => {
      if (e.target === imageFileInput) return;
      if (uploadZone.tagName === 'LABEL' && uploadZone.getAttribute('for') === 'image-file-input') return;
      if (imageFileInput) imageFileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--gold-primary)';
      uploadZone.style.backgroundColor = 'rgba(197, 160, 89, 0.08)';
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
        bufferFilesForUpload(e.dataTransfer.files);
      }
    });
  }

  function bufferFilesForUpload(files) {
    const currentValid = getValidImages();
    const availableSlots = 6 - (currentValid.length + pendingImageFiles.length);

    if (availableSlots <= 0) {
      showToast('Limite máximo de 6 fotos por produto atingido.', 'warning', 4000);
      return;
    }

    const filesToAdd = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      showToast(`Apenas ${availableSlots} foto(s) aceita(s) para respeitar o limite de 6 fotos.`, 'info', 4000);
    }

    filesToAdd.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      pendingImageFiles.push({ file, previewUrl, name: file.name });
    });

    renderImagePreviews();
    showToast(`${filesToAdd.length} foto(s) selecionada(s). O envio ao banco ocorrerá ao salvar o produto.`, 'info', 4000);
    if (imageFileInput) imageFileInput.value = '';
  }

  // ==========================================================================
  // 5. Insumos Vinculados (Matéria-Prima / Embalagens)
  // ==========================================================================
  async function loadAvailableSupplies() {
    try {
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      };

      let list = [];
      if (typeof SUPABASE_URL !== 'undefined') {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/supplies?select=*&order=name.asc`, { headers });
        if (res.ok) list = await res.json();
      }

      if (!list || list.length === 0) {
        const client = getDb();
        if (client) {
          const { data } = await client.from('supplies').select('*').order('name', { ascending: true });
          if (data) list = data;
        }
      }

      availableSupplies = Array.isArray(list) ? list : [];

      if (supplySelect) {
        supplySelect.innerHTML = '<option value="">-- Selecione um insumo cadastrado --</option>';
        availableSupplies.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name} (${formatBRL(s.unit_cost)} / ${s.unit || 'un'})`;
          supplySelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Aviso ao buscar insumos:', err);
    }
  }

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

    linkedSuppliesTbody.querySelectorAll('.btn-danger-outline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        linkedSupplies.splice(idx, 1);
        renderLinkedSuppliesTable();
      });
    });

    recalculateFinancials();
  }

  if (btnAddSupply) {
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

      const selected = availableSupplies.find(s => String(s.id) === String(supplyId));
      if (!selected) return;

      const existingIndex = linkedSupplies.findIndex(item => String(item.supply_id) === String(supplyId));
      if (existingIndex >= 0) {
        linkedSupplies[existingIndex].quantity = parseFloat((linkedSupplies[existingIndex].quantity + qty).toFixed(4));
      } else {
        linkedSupplies.push({
          supply_id: selected.id,
          name: selected.name,
          unit_cost: Number(selected.unit_cost) || 0,
          unit: selected.unit || 'un',
          quantity: qty
        });
      }

      supplySelect.value = '';
      supplyQtyInput.value = '1';
      renderLinkedSuppliesTable();
      showToast('Insumo vinculado com sucesso!', 'success');
    });
  }

  // ==========================================================================
  // 6. Engenharia Financeira & Cálculo de Markup 300%
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
        suppliesCost += (parseVal(item.unit_cost) * parseVal(item.quantity));
      });
    }

    const totalCost = prodCost + suppliesCost;
    const currentPrice = parseVal(priceInput ? priceInput.value : 0);

    if (totalCost > 0 && (autoMarkup || !manualPriceEdited || currentPrice <= 0)) {
      // 300% de Markup sobre o custo total (Preço = Custo * 4.0)
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
    if (calcUnitProfit) {
      calcUnitProfit.textContent = formatBRL(unitProfit);
      if (unitProfit < 0) {
        calcUnitProfit.classList.remove('highlight-green');
        calcUnitProfit.style.color = '#DC2626';
      } else {
        calcUnitProfit.classList.add('highlight-green');
        calcUnitProfit.style.color = '';
      }
    }
  }

  if (btnRecalc300) {
    btnRecalc300.addEventListener('click', (e) => {
      e.preventDefault();
      manualPriceEdited = false;
      const prodCost = parseVal(costInput.value);
      let suppliesCost = 0;
      linkedSupplies.forEach(item => suppliesCost += (parseVal(item.unit_cost) * parseVal(item.quantity)));
      const totalCost = prodCost + suppliesCost;

      if (totalCost > 0) {
        const simulated = totalCost * 4.0;
        priceInput.value = simulated.toFixed(2);
        if (originalPriceInput) {
          originalPriceInput.value = (simulated * 1.4).toFixed(2);
          originalPriceInput.dataset.autoFilled = 'true';
        }
        recalculateFinancials(true);
        showToast(`Preço recalculado com 300% de markup: ${formatBRL(simulated)}`, 'success');
      } else {
        showToast('Informe o custo direto da peça para calcular os 300%.', 'info');
        costInput.focus();
      }
    });
  }

  ['input', 'change', 'keyup'].forEach(evt => {
    if (costInput) {
      costInput.addEventListener(evt, () => {
        const curPrice = parseVal(priceInput.value);
        recalculateFinancials(!manualPriceEdited || curPrice <= 0);
      });
    }
    if (priceInput) {
      priceInput.addEventListener(evt, () => {
        const val = parseVal(priceInput.value);
        if (val > 0) {
          manualPriceEdited = true;
          recalculateFinancials(false);
          // Auto-preenche preço De caso vazio
          if (originalPriceInput && (!originalPriceInput.value || originalPriceInput.dataset.autoFilled === 'true')) {
            originalPriceInput.value = (val * 1.4).toFixed(2);
            originalPriceInput.dataset.autoFilled = 'true';
          }
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
  // 7. Submissão do Formulário e Gravação no Banco
  // ==========================================================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      showToast('Supabase não configurado. Verifique assets/js/supabase.js', 'error');
      return;
    }

    const name = nameInput.value.trim();
    const category = categoryInput.value.trim();
    const sku = (skuInput.value.trim() || 'SLR-0001').toUpperCase();
    const cost = parseFloat(costInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;

    if (!name) {
      showToast('O nome do produto é obrigatório.', 'error');
      nameInput.focus();
      return;
    }

    if (!category) {
      showToast('A categoria é obrigatória.', 'error');
      categoryInput.focus();
      return;
    }

    if (!sku) {
      showToast('O SKU do produto é obrigatório.', 'error');
      skuInput.focus();
      return;
    }

    if (price <= 0) {
      showToast('Informe um preço de venda superior a R$ 0,00.', 'error');
      priceInput.focus();
      return;
    }

    // Trava botão para evitar duplo envio
    btnSave.disabled = true;
    btnSave.innerHTML = `
      <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid #FFF; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 0.5rem; vertical-align: middle;"></span>
      Cadastrando Peça...
    `;

    try {
      // 7.1 Upload de fotos pendentes se houver
      if (pendingImageFiles.length > 0) {
        if (uploadProgressModal) uploadProgressModal.classList.add('active');

        const totalFiles = pendingImageFiles.length;
        for (let i = 0; i < totalFiles; i++) {
          const item = pendingImageFiles[i];
          const pct = Math.round((i / totalFiles) * 100);

          if (uploadProgressBar) uploadProgressBar.style.width = `${pct}%`;
          if (uploadProgressPct) uploadProgressPct.textContent = `${pct}%`;
          if (uploadProgressStatus) {
            uploadProgressStatus.textContent = `Enviando foto ${i + 1} de ${totalFiles} para Fotos Produtos/${sku}/...`;
          }

          try {
            const publicUrl = await uploadImageToStorage(item.file, sku, 'Fotos Produtos');
            // Encontra o primeiro slot livre para atribuir a URL
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
            console.warn(`Aviso no upload da imagem ${item.name}:`, uploadErr);
            showToast(`Aviso no upload de ${item.name}: ${uploadErr.message || 'Verifique permissões de Storage'}`, 'warning', 4500);
          }
        }

        if (uploadProgressBar) uploadProgressBar.style.width = '100%';
        if (uploadProgressPct) uploadProgressPct.textContent = '100%';
        if (uploadProgressStatus) uploadProgressStatus.textContent = 'Fotos processadas com sucesso!';

        pendingImageFiles.forEach(p => URL.revokeObjectURL(p.previewUrl));
        pendingImageFiles = [];
        renderImagePreviews();

        await new Promise(r => setTimeout(r, 350));
        if (uploadProgressModal) uploadProgressModal.classList.remove('active');
      }

      // 7.2 Monta payload do produto
      const isRing = isRingCategory(category);
      const ringSizes = isRing ? getRingSizesData() : {};
      const originalPriceVal = originalPriceInput && parseFloat(originalPriceInput.value) > 0 
        ? parseFloat(originalPriceInput.value) 
        : null;

      const productPayload = {
        name,
        status: statusInput.value || 'ativo',
        category,
        sku,
        description: descInput.value.trim(),
        product_cost: cost,
        cost_price: cost,
        sale_price: price,
        original_price: originalPriceVal,
        stock: parseInt(stockInput.value, 10) || 0,
        stock_qty: parseInt(stockInput.value, 10) || 0,
        images: getValidImages(),
        sizes: ringSizes
      };

      // 7.3 Insere no Supabase
      const token = (typeof getAuthToken === 'function' ? getAuthToken() : null);
      let authHeaders = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      };

      let createdProduct = null;

      // Tentativa 1: Via REST POST direto
      try {
        let postRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify([productPayload])
        });

        // Se der 401 por token expirado, tenta com a anon key
        if ((postRes.status === 401 || postRes.status === 403) && token) {
          authHeaders['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
          postRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify([productPayload])
          });
        }

        if (postRes.ok) {
          const list = await postRes.json();
          if (Array.isArray(list) && list.length > 0) {
            createdProduct = list[0];
          }
        } else {
          const errBody = await postRes.text();
          console.warn('REST POST produtos retornou erro:', postRes.status, errBody);
          // Se for erro de RLS (42501), lança mensagem detalhada
          if (errBody.includes('42501') || errBody.includes('violates row-level security')) {
            throw new Error('Permissão negada (RLS). Execute o script "supabase_fix_products_permissions.sql" no SQL Editor do Supabase ou faça login no painel.');
          }
          if (errBody.includes('duplicate key') || errBody.includes('products_sku_key')) {
            throw new Error(`O código SKU "${sku}" já está em uso por outro produto. Por favor, altere o SKU.`);
          }
        }
      } catch (restErr) {
        if (restErr.message && restErr.message.includes('Permissão negada')) throw restErr;
        if (restErr.message && restErr.message.includes('já está em uso')) throw restErr;
        console.warn('Tentando fallback via cliente JS:', restErr);
      }

      // Tentativa 2: Fallback via cliente Supabase JS
      if (!createdProduct) {
        const client = getDb();
        if (client) {
          const { data: newProd, error: insertErr } = await client
            .from('products')
            .insert([productPayload])
            .select()
            .single();

          if (insertErr) {
            if (insertErr.code === '42501' || (insertErr.message && insertErr.message.includes('row-level security'))) {
              throw new Error('Permissão negada (RLS). Execute o script "supabase_fix_products_permissions.sql" no SQL Editor do Supabase.');
            }
            if (insertErr.code === '23505' || (insertErr.message && insertErr.message.includes('duplicate key'))) {
              throw new Error(`O código SKU "${sku}" já está em uso por outro produto.`);
            }
            throw insertErr;
          }
          createdProduct = newProd;
        }
      }

      if (!createdProduct || !createdProduct.id) {
        throw new Error('Não foi possível confirmar a gravação do produto no banco de dados.');
      }

      // 7.4 Grava os insumos vinculados na tabela product_supplies
      if (linkedSupplies.length > 0 && createdProduct.id) {
        const suppliesPayload = linkedSupplies.map(item => ({
          product_id: createdProduct.id,
          supply_id: item.supply_id,
          quantity: item.quantity
        }));

        try {
          await fetch(`${SUPABASE_URL}/rest/v1/product_supplies`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(suppliesPayload)
          });
        } catch (suppErr) {
          console.warn('Aviso ao gravar insumos vinculados:', suppErr);
        }
      }

      // 7.5 Feedback de sucesso
      showToast('Produto cadastrado com sucesso!', 'success', 3500);

      // Adiciona ao catálogo local para evitar colisão imediata
      existingProductsCatalog.push({ sku, category });

      // Abre Modal de Sucesso
      if (successModal) {
        if (successModalDesc) {
          successModalDesc.innerHTML = `
            A joia <strong>${name}</strong> (SKU <code>${sku}</code>) foi adicionada com sucesso ao catálogo.
          `;
        }
        successModal.classList.add('active');
      } else {
        setTimeout(() => {
          window.location.href = 'admin.html';
        }, 1200);
      }

    } catch (err) {
      console.error('Falha ao cadastrar produto:', err);
      showToast('Erro ao cadastrar: ' + (err.message || err), 'error', 6000);
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Salvar e Cadastrar Produto →';
    }
  });

  // Ação de Cadastrar Outro Produto no Modal de Sucesso
  if (btnModalAddAnother) {
    btnModalAddAnother.addEventListener('click', () => {
      if (successModal) successModal.classList.remove('active');
      // Reseta formulário mantendo a categoria
      const lastCat = categoryInput.value;
      form.reset();
      categoryInput.value = lastCat;
      linkedSupplies = [];
      pendingImageFiles = [];
      manualPriceEdited = false;
      photoSlots.forEach(slot => { if (slot) slot.value = ''; });
      renderImagePreviews();
      renderLinkedSuppliesTable();
      generateNextSku();
      nameInput.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

});
