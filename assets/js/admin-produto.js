/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Cadastro e Edição de Produtos com Vínculo de Insumos e Geração Automática de SKU
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Guarda de rota autenticada
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const adminEmailElem = document.getElementById('admin-user-email');
  if (adminEmailElem) adminEmailElem.textContent = currentUser.email || 'Operador Autenticado';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  // Parâmetros de URL (Modo Edição vs Modo Novo)
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const isEditMode = Boolean(productId);

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

  // Elementos do Cálculo ao Vivo
  const calcProdCost = document.getElementById('calc-prod-cost');
  const calcSuppliesCost = document.getElementById('calc-supplies-cost');
  const calcTotalCost = document.getElementById('calc-total-cost');
  const calcSalePrice = document.getElementById('calc-sale-price');
  const calcUnitProfit = document.getElementById('calc-unit-profit');

  // Estado Local
  let availableSupplies = [];
  let linkedSupplies = []; // [{ supply_id, name, unit_cost, unit, quantity }]
  let currentImages = [];

  // ==========================================================================
  // Carregamento Inicial (Insumos e Dados do Produto se Edição)
  // ==========================================================================

  if (isEditMode) {
    pageTitle.textContent = 'Editar Produto';
    btnSave.textContent = 'Atualizar Produto & Insumos';
  }

  await loadAvailableSupplies();

  if (isEditMode) {
    await loadProductData(productId);
  } else {
    // Sugere SKU inicial padrão
    updateGeneratedSku();
    toggleRingSizes();
  }

  // ==========================================================================
  // Geração Automática de SKU (PREFIXO-0000)
  // ==========================================================================

  async function updateGeneratedSku() {
    const category = categoryInput.value.trim() || 'Geral';
    const prefix = generateCategoryPrefix(category);

    try {
      if (db && isSupabaseConfigured()) {
        // Conta quantos produtos existem com o prefixo para definir a sequência
        const { count, error } = await db
          .from('products')
          .select('id', { count: 'exact', head: true })
          .ilike('sku', `${prefix}-%`);

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
   * Obtém a lista consolidada de URLs válidas (campos vazios são ignorados).
   * Garante no máximo 6 fotos.
   */
  function getValidImages() {
    const valid = [];
    photoSlots.forEach(slot => {
      if (!slot) return;
      const val = slot.value.trim();
      // Ignora campos vazios e valida links razoáveis
      if (val && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/'))) {
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

  /**
   * Renderiza as miniaturas das fotos preenchidas e atualiza o badge de contagem
   */
  function renderImagePreviews() {
    const validImages = getValidImages();
    currentImages = validImages;

    if (imgCountBadge) {
      imgCountBadge.textContent = validImages.length;
    }

    imagePreviewsContainer.innerHTML = '';

    if (validImages.length === 0) {
      imagePreviewsContainer.innerHTML = `
        <div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic; padding: 0.5rem 0;">
          Nenhuma foto adicionada ainda. Adicione links nos campos acima ou faça upload de arquivos.
        </div>
      `;
      return;
    }

    validImages.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.style.position = 'relative';
      item.innerHTML = `
        <img src="${url}" alt="Foto ${idx + 1}" onerror="this.src='https://via.placeholder.com/80?text=Inválida'">
        ${idx === 0 ? '<span style="position: absolute; bottom: 2px; left: 2px; background: rgba(197, 164, 101, 0.9); color: #181614; font-size: 0.55rem; font-weight: 700; padding: 1px 4px; border-radius: 2px; text-transform: uppercase;">Capa</span>' : ''}
        <button type="button" class="image-preview-remove" data-index="${idx}" title="Remover esta foto">&times;</button>
      `;
      imagePreviewsContainer.appendChild(item);
    });

    // Remove imagem ao clicar no X da miniatura e reorganiza os slots
    imagePreviewsContainer.querySelectorAll('.image-preview-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        const updated = getValidImages();
        updated.splice(index, 1);
        syncSlotsFromImages(updated);
      });
    });
  }

  // Monitora alterações manuais em cada um dos 6 slots
  photoSlots.forEach(slot => {
    if (!slot) return;
    slot.addEventListener('input', () => {
      renderImagePreviews();
    });
    slot.addEventListener('change', () => {
      renderImagePreviews();
    });
  });

  // Upload para Supabase Storage
  uploadZone.addEventListener('click', () => imageFileInput.click());
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--gold-primary)';
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '';
  });
  uploadZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  });

  imageFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
    }
  });

  async function handleFilesUpload(fileList) {
    if (!isSupabaseConfigured()) {
      showToast('Configure as chaves do Supabase para fazer upload.', 'error');
      return;
    }

    const currentValid = getValidImages();
    const remainingSlots = 6 - currentValid.length;

    if (remainingSlots <= 0) {
      showToast('Limite de 6 fotos por produto já atingido. Remova uma foto antes de enviar outra.', 'error', 4500);
      return;
    }

    const filesToUpload = Array.from(fileList).slice(0, remainingSlots);
    if (fileList.length > remainingSlots) {
      showToast(`Apenas ${remainingSlots} foto(s) aceita(s) para respeitar o limite máximo de 6 fotos.`, 'info', 4000);
    }

    const productSku = (skuInput.value.trim() || 'geral').toUpperCase();
    showToast(`Enviando ${filesToUpload.length} foto(s) para a pasta "${productSku}"...`, 'info');

    for (const file of filesToUpload) {
      try {
        const publicUrl = await uploadImageToStorage(file, productSku, 'Fotos Produtos');
        
        // Encontra o primeiro slot vazio de 1 a 6
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

        renderImagePreviews();
        showToast(`Foto enviada com sucesso!`, 'success');
      } catch (err) {
        console.error('Falha de upload:', err);
        showToast(`Erro ao enviar ${file.name}: ${err.message}`, 'error', 5000);
      }
    }
    // Reseta o file input para permitir reenvio do mesmo arquivo se desejado
    imageFileInput.value = '';
  }

  // ==========================================================================
  // Carregamento de Insumos Disponíveis (Tabela supplies)
  // ==========================================================================

  async function loadAvailableSupplies() {
    try {
      const { data, error } = await db
        .from('supplies')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erro ao listar insumos:', error);
        supplySelect.innerHTML = '<option value="">Erro ao carregar insumos</option>';
        return;
      }

      availableSupplies = data || [];
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
    } catch (e) {
      console.error('Erro de conexão com supplies:', e);
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
  // Calculadora Financeira em Tempo Real
  // ==========================================================================

  function recalculateFinancials() {
    const prodCost = parseFloat(costInput.value) || 0;
    const salePrice = parseFloat(priceInput.value) || 0;

    let suppliesCost = 0;
    linkedSupplies.forEach(item => {
      suppliesCost += (item.unit_cost * item.quantity);
    });

    const totalCost = prodCost + suppliesCost;
    const unitProfit = salePrice - totalCost;

    calcProdCost.textContent = formatBRL(prodCost);
    calcSuppliesCost.textContent = formatBRL(suppliesCost);
    calcTotalCost.textContent = formatBRL(totalCost);
    calcSalePrice.textContent = formatBRL(salePrice);
    calcUnitProfit.textContent = formatBRL(unitProfit);

    if (unitProfit < 0) {
      calcUnitProfit.classList.remove('highlight-green');
      calcUnitProfit.style.color = '#dc3545';
    } else {
      calcUnitProfit.classList.add('highlight-green');
      calcUnitProfit.style.color = '';
    }
  }

  function autoGenerateOriginalPrice() {
    const sale = parseFloat(priceInput.value) || 0;
    if (sale > 0 && originalPriceInput && (!originalPriceInput.value || originalPriceInput.dataset.autoFilled === 'true')) {
      const randomFactor = 1.35 + Math.random() * 0.15; // 35% a 50% acima
      const raw = sale * randomFactor;
      const rounded = (Math.ceil(raw) - 0.10).toFixed(2);
      originalPriceInput.value = rounded;
      originalPriceInput.dataset.autoFilled = 'true';
    }
  }

  costInput.addEventListener('input', recalculateFinancials);
  priceInput.addEventListener('input', () => {
    recalculateFinancials();
    autoGenerateOriginalPrice();
  });

  if (originalPriceInput) {
    originalPriceInput.addEventListener('input', () => {
      delete originalPriceInput.dataset.autoFilled;
    });
  }

  // ==========================================================================
  // Modo Edição: Carregamento dos dados existentes
  // ==========================================================================

  async function loadProductData(id) {
    try {
      // 1. Busca dados do produto
      const { data: prod, error: prodErr } = await db
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (prodErr || !prod) {
        showToast('Produto não encontrado para edição.', 'error');
        return;
      }

      nameInput.value = prod.name || '';
      statusInput.value = prod.status || 'ativo';
      categoryInput.value = prod.category || '';
      skuInput.value = prod.sku || '';
      descInput.value = prod.description || '';
      costInput.value = Number(prod.product_cost || 0).toFixed(2);
      priceInput.value = Number(prod.sale_price || 0).toFixed(2);
      if (originalPriceInput) {
        originalPriceInput.value = prod.original_price ? Number(prod.original_price).toFixed(2) : '';
        delete originalPriceInput.dataset.autoFilled;
      }
      stockInput.value = prod.stock ?? 0;

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
      } else {
        ringSizeInputs.forEach(input => {
          input.value = '';
          const parent = input.closest('.ring-size-item');
          if (parent) parent.classList.remove('has-stock');
        });
      }

      // Imagens (limita em até 6)
      let loadedImages = [];
      if (Array.isArray(prod.images)) {
        loadedImages = prod.images;
      } else if (typeof prod.images === 'string') {
        try {
          loadedImages = JSON.parse(prod.images);
        } catch (e) {
          loadedImages = prod.images.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        }
      }
      syncSlotsFromImages(loadedImages);

      // 2. Busca insumos vinculados (product_supplies)
      const { data: pSupplies, error: suppErr } = await db
        .from('product_supplies')
        .select('id, supply_id, quantity')
        .eq('product_id', id);

      if (!suppErr && pSupplies) {
        linkedSupplies = [];
        pSupplies.forEach(ps => {
          const sup = availableSupplies.find(s => s.id == ps.supply_id);
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

      recalculateFinancials();
    } catch (err) {
      console.error('Erro ao carregar dados do produto:', err);
    }
  }

  // ==========================================================================
  // Submissão do Formulário (Insert ou Update)
  // ==========================================================================

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      showToast('Supabase não configurado.', 'error');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Gravando no Banco...';

    // Monta payload do produto (incluindo grade de aros se for anel)
    const isRing = isRingCategory(categoryInput.value);
    const ringSizes = isRing ? getRingSizesData() : {};

    const originalPriceVal = originalPriceInput && parseFloat(originalPriceInput.value) > 0 
      ? parseFloat(originalPriceInput.value) 
      : null;

    const productPayload = {
      name: nameInput.value.trim(),
      status: statusInput.value,
      category: categoryInput.value.trim(),
      sku: skuInput.value.trim().toUpperCase(),
      description: descInput.value.trim(),
      product_cost: parseFloat(costInput.value) || 0,
      sale_price: parseFloat(priceInput.value) || 0,
      original_price: originalPriceVal,
      stock: parseInt(stockInput.value, 10) || 0,
      images: getValidImages(),
      sizes: ringSizes
    };

    try {
      let savedProductId = productId;

      if (isEditMode) {
        // Atualiza produto
        const { error: updateErr } = await db
          .from('products')
          .update(productPayload)
          .eq('id', productId);

        if (updateErr) throw updateErr;

        // Remove vínculos antigos de insumos
        const { error: delErr } = await db
          .from('product_supplies')
          .delete()
          .eq('product_id', productId);

        if (delErr) console.warn('Aviso ao limpar insumos anteriores:', delErr);

      } else {
        // Cria novo produto
        const { data: newProd, error: insertErr } = await db
          .from('products')
          .insert([productPayload])
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        savedProductId = newProd.id;
      }

      // Grava os novos vínculos em product_supplies
      if (linkedSupplies.length > 0 && savedProductId) {
        const suppliesPayload = linkedSupplies.map(item => ({
          product_id: savedProductId,
          supply_id: item.supply_id,
          quantity: item.quantity
        }));

        const { error: suppInsertErr } = await db
          .from('product_supplies')
          .insert(suppliesPayload);

        if (suppInsertErr) {
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
  });

});
