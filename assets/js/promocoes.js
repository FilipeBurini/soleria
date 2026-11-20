/**
 * ==========================================================================
 * SOLÉRIA — SISTEMA DE PROMOÇÕES & OFERTAS (promocoes.js)
 * Renderiza exclusivamente as joias marcadas como promocionais no estoque.
 * Modal idêntico à Home/Catálogo com galeria, aros em estoque, lightbox e sacola.
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos DOM do Catálogo de Promoções
  const grid = document.getElementById('product-grid');
  const spinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const categoryFilters = document.getElementById('category-filters');
  const searchInput = document.getElementById('catalog-search');
  const promoCountChip = document.getElementById('promo-count-chip');
  const catalogAdminBar = document.getElementById('catalog-admin-bar');

  // Modal DOM (Estrutura idêntica à Home/index.html)
  const modal = document.getElementById('product-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCloseSecondary = document.getElementById('btn-modal-close-secondary');
  const modalMainImg = document.getElementById('modal-main-img');
  const modalMainImageWrap = document.getElementById('modal-main-image-wrap');
  const modalThumbnails = document.getElementById('modal-thumbnails');
  const modalTitle = document.getElementById('modal-title');
  const modalCategory = document.getElementById('modal-category');
  const modalSku = document.getElementById('modal-sku');
  const modalSkuVal = document.getElementById('modal-sku-val');
  const modalPrice = document.getElementById('modal-price');
  const modalPriceOld = document.getElementById('modal-price-old');
  const modalDiscountBadge = document.getElementById('modal-discount-badge');
  const modalPromoRow = document.getElementById('modal-promo-row');
  const modalPricePrefix = document.getElementById('modal-price-prefix');
  const modalInstallment = document.getElementById('modal-installment');
  const modalDesc = document.getElementById('modal-description');
  const modalWhatsappBtn = document.getElementById('modal-whatsapp-btn');
  const modalSizesWrapper = document.getElementById('modal-sizes-wrapper');
  const modalSizesList = document.getElementById('modal-sizes-list');

  // Lightbox DOM (Foto Ampliada)
  const lightboxModal = document.getElementById('image-lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxCloseBottom = document.getElementById('lightbox-btn-close-bottom');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxPrevBtn = document.getElementById('lightbox-prev');
  const lightboxNextBtn = document.getElementById('lightbox-next');
  const lightboxThumbnails = document.getElementById('lightbox-thumbnails');
  const lightboxImgWrapper = document.getElementById('lightbox-img-wrapper');

  // Estados Globais
  let allPromoProducts = [];
  let currentCategory = 'todas';
  let searchTerm = '';
  let isManagerActive = false;
  let currentProductGallery = [];
  let currentGalleryIndex = 0;

  // Utilitário de Formatação de Moeda
  function formatBRL(val) {
    if (typeof window.formatBRL === 'function') return window.formatBRL(val);
    const n = Number(val) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Notificações Toast
  function showToast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  // Checa se gestor está autenticado no Supabase
  checkAdminSession();

  async function checkAdminSession() {
    try {
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || null));
      if (!client) return;
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        isManagerActive = true;
        if (catalogAdminBar) catalogAdminBar.style.display = 'block';
      }
    } catch (e) {}
  }

  // Identifica se uma joia está marcada para promoção (SOMENTE com marcação explícita do lojista)
  function isProductInPromo(prod) {
    if (!prod) return false;
    if (prod.is_promo === true || prod.is_promo === 'true' || prod.is_promo === 1) return true;
    let rawSizes = prod.sizes;
    if (typeof rawSizes === 'string') {
      try { rawSizes = JSON.parse(rawSizes); } catch (e) { rawSizes = null; }
    }
    if (rawSizes && (rawSizes._is_promo === true || rawSizes._is_promo === 'true' || rawSizes._is_promo === 1)) return true;
    return false;
  }

  // Preço promocional e desconto
  function calculatePromotionalPricing(product) {
    const salePrice = Number(product.sale_price) || 0;
    if (salePrice <= 0) {
      return { salePrice: 0, oldPrice: 0, discountPct: 0, hasDiscount: false };
    }

    let oldPrice = 0;
    const customOriginal = Number(product.original_price);
    let rawSizes = product.sizes;
    if (typeof rawSizes === 'string') {
      try { rawSizes = JSON.parse(rawSizes); } catch (e) { rawSizes = null; }
    }
    const sizesOldPrice = rawSizes && rawSizes._promo_original_price ? Number(rawSizes._promo_original_price) : 0;

    if (!isNaN(customOriginal) && customOriginal > salePrice) {
      oldPrice = customOriginal;
    } else if (sizesOldPrice > salePrice) {
      oldPrice = sizesOldPrice;
    } else {
      const raw = salePrice * 1.35;
      oldPrice = Math.ceil(raw) - 0.10;
      if (oldPrice <= salePrice) oldPrice = salePrice + 10;
    }

    const discountPct = oldPrice > salePrice ? Math.round(((oldPrice - salePrice) / oldPrice) * 100) : 0;

    return {
      salePrice,
      oldPrice,
      discountPct,
      hasDiscount: oldPrice > salePrice && discountPct >= 5
    };
  }

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
    let raw = {};
    if (typeof sizesField === 'object' && !Array.isArray(sizesField)) {
      raw = sizesField;
    } else if (typeof sizesField === 'string') {
      try {
        const parsed = JSON.parse(sizesField);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
      } catch (e) {
        return {};
      }
    }
    // Remove qualquer metadado interno (que comece com _) para não vazar nos aros do card ou modal
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('_')) {
        clean[k] = v;
      }
    }
    return clean;
  }

  // Busca do Supabase
  async function fetchPromoProducts() {
    if (spinner) spinner.style.display = 'block';
    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    if (window.TENANT_PROMISE) {
      try { await window.TENANT_PROMISE; } catch (e) {}
    }

    const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || null));
    let rawData = null;

    try {
      if (client && isSupabaseConfigured()) {
        const { data, error } = await client
          .from('products')
          .select('*')
          .eq('status', 'ativo')
          .order('name');

        if (!error && Array.isArray(data)) {
          rawData = data;
          try {
            localStorage.setItem('soleria_cached_products', JSON.stringify(data));
          } catch (e) {}
        }
      }

      if (!rawData) {
        const cached = localStorage.getItem('soleria_cached_products');
        if (cached) rawData = JSON.parse(cached);
      }

      const allList = rawData || [];
      // Filtra apenas os marcados para promoção
      allPromoProducts = allList.filter(p => isProductInPromo(p));

      // Atualiza badge de contagem no Hero
      if (promoCountChip) {
        const count = allPromoProducts.length;
        if (count === 1) {
          promoCountChip.textContent = `✦ 1 joia exclusiva em oferta hoje`;
        } else if (count > 1) {
          promoCountChip.textContent = `✦ ${count} joias exclusivas em promoção hoje`;
        } else {
          promoCountChip.textContent = `✦ Nenhuma promoção ativa no momento`;
        }
      }

      setupCategoryFilters();
      renderPromoCatalog();
    } catch (err) {
      console.error('Erro ao carregar promoções:', err);
      if (emptyState) emptyState.style.display = 'block';
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  }

  // Filtros por Categoria
  function setupCategoryFilters() {
    if (!categoryFilters) return;

    const filterSection = document.getElementById('promocoes-filtro');

    if (allPromoProducts.length === 0) {
      if (filterSection) filterSection.style.display = 'none';
      categoryFilters.innerHTML = '';
      return;
    }

    if (filterSection) filterSection.style.display = 'block';

    const categories = new Set();
    allPromoProducts.forEach(p => {
      if (p.category && p.category.trim()) {
        categories.add(p.category.trim());
      }
    });

    categoryFilters.innerHTML = `
      <button class="category-pill ${currentCategory === 'todas' ? 'active' : ''}" data-category="todas">
        Todas as Promoções (${allPromoProducts.length})
      </button>
    `;

    Array.from(categories).sort().forEach(cat => {
      const catCount = allPromoProducts.filter(p => (p.category || '').toLowerCase() === cat.toLowerCase()).length;
      const btn = document.createElement('button');
      btn.className = `category-pill ${currentCategory.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
      btn.dataset.category = cat.toLowerCase();
      btn.textContent = `${cat} (${catCount})`;
      categoryFilters.appendChild(btn);
    });

    categoryFilters.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        categoryFilters.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        renderPromoCatalog();
      });
    });
  }

  // Renderiza Grid de Produtos em Promoção
  function renderPromoCatalog() {
    if (!grid) return;
    const q = (searchTerm || '').toLowerCase().trim();

    const filtered = allPromoProducts.filter(p => {
      const matchCat = currentCategory === 'todas' || (p.category && p.category.toLowerCase() === currentCategory.toLowerCase());
      const matchSearch = !q || 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.sku && p.sku.toLowerCase().includes(q)) || 
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q));

      return matchCat && matchSearch;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = 'grid';

    filtered.forEach(product => {
      const images = parseImages(product.images);
      const mainImgUrl = images[0] || 'assets/images/logo-simbolo.png';

      const sizes = parseSizes(product.sizes);
      const sizesEntries = Object.entries(sizes).filter(([k]) => !k.startsWith('_'));
      const availableSizesList = sizesEntries
        .filter(([_, qty]) => Number(qty) > 0)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([size]) => size);

      const totalStock = sizesEntries.length > 0
        ? sizesEntries.reduce((acc, [_, q]) => acc + (Number(q) || 0), 0)
        : (Number(product.stock) || 0);

      const isSoldOut = totalStock <= 0;

      const sizesPreviewHtml = availableSizesList.length > 0
        ? `<div class="card-sizes-preview">💍 Aros: ${availableSizesList.join(' · ')}</div>`
        : (isSoldOut ? `<div class="card-sizes-preview" style="color: #991B1B; font-weight: 600;">⚠️ Esgotado</div>` : '');

      const promo = calculatePromotionalPricing(product);

      const card = document.createElement('article');
      card.className = `product-card ${isSoldOut ? 'is-soldout' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Ver detalhes e comprar ${product.name}`);

      card.innerHTML = `
        <div class="product-card-image-box">
          <img class="product-card-img" src="${mainImgUrl}" alt="${product.name}" loading="lazy" onerror="this.src='assets/images/logo-simbolo.png'">
          ${isSoldOut ? `<span class="product-card-badge-soldout">Esgotado</span>` : (product.category ? `<span class="product-card-category-badge badge-top-left">${product.category}</span>` : '')}
          ${promo.hasDiscount && !isSoldOut ? `<span class="product-card-discount-badge">-${promo.discountPct}% OFF</span>` : '<span class="product-card-discount-badge">OFERTA</span>'}
          
          <!-- TARJA ESPECÍFICA DE PROMOÇÃO NA BASE DA FOTO -->
          <div class="promo-card-tarja">
            <div class="promo-tarja-main">
              <span class="promo-tarja-icon">🔥</span>
              <span class="promo-tarja-label">PROMOÇÃO</span>
            </div>
            <div class="promo-tarja-prices">
              ${promo.hasDiscount ? `<span class="promo-tarja-old">De ${formatBRL(promo.oldPrice)}</span>` : ''}
              <span class="promo-tarja-current">Por <strong>${formatBRL(promo.salePrice)}</strong></span>
            </div>
          </div>
        </div>
        <div class="product-card-content">
          ${isManagerActive && product.product_cost ? `
            <div class="promo-manager-cost-tag" title="Visível apenas para o gestor autenticado">
              🛡️ Custo da peça: <strong>${formatBRL(product.product_cost)}</strong> · Margem: <strong>${formatBRL(promo.salePrice - Number(product.product_cost))}</strong>
            </div>
          ` : ''}
          <h2 class="product-card-title">${product.name}</h2>
          <p class="product-card-desc">${stripHtml(product.description || '')}</p>
          ${sizesPreviewHtml}
          <div class="product-card-footer">
            <div class="product-card-pricing-block">
              ${promo.hasDiscount ? `<span class="product-price-old">De ${formatBRL(promo.oldPrice)}</span>` : ''}
              <div class="product-card-price">
                <span class="price-prefix" style="color: var(--brand-terracotta);">Por</span> ${formatBRL(promo.salePrice)}
              </div>
            </div>
            <span class="product-card-action-hint">
              ${isSoldOut ? 'Esgotado &rarr;' : 'Detalhes &rarr;'}
            </span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openProductModal(product));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openProductModal(product);
      });

      grid.appendChild(card);
    });
  }

  // Busca em tempo real
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderPromoCatalog();
    });
  }

  function stripHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }

  function renderProductDescription(rawDesc) {
    if (!rawDesc) {
      return 'Semijoia de alta qualidade com banho nobre, verniz protetor e acabamento primoroso de joia.';
    }
    const str = String(rawDesc).trim();
    if (/<[a-z][\s\S]*>/i.test(str)) {
      return str;
    }
    return str.split(/\r?\n\r?\n/).map(p => `<p style="margin-bottom: 0.65rem;">${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
  }

  /**
   * ========================================================================
   * MODAL DO PRODUTO (Estrutura idêntica à Home/index.html e catalogo.js)
   * ========================================================================
   */
  function openProductModal(product) {
    if (!modal) return;

    const images = parseImages(product.images);
    currentProductGallery = images;
    currentGalleryIndex = 0;

    const promo = calculatePromotionalPricing(product);

    if (modalTitle) modalTitle.textContent = product.name;
    if (modalCategory) modalCategory.textContent = product.category || 'Semijoias';
    if (modalDesc) modalDesc.innerHTML = renderProductDescription(product.description);

    // Exibe SKU discreto abaixo do nome do item
    if (modalSku && modalSkuVal) {
      if (product.sku && product.sku !== 'N/A') {
        modalSkuVal.textContent = product.sku;
        modalSku.style.display = 'block';
      } else {
        modalSku.style.display = 'none';
      }
    }

    // Exibe preços promocionais no modal
    if (promo.hasDiscount) {
      if (modalPromoRow) modalPromoRow.style.display = 'flex';
      if (modalPriceOld) modalPriceOld.textContent = `De ${formatBRL(promo.oldPrice)}`;
      if (modalDiscountBadge) modalDiscountBadge.textContent = `-${promo.discountPct}% OFF`;
      if (modalPricePrefix) modalPricePrefix.style.display = 'inline';
    } else {
      if (modalPromoRow) modalPromoRow.style.display = 'none';
      if (modalPricePrefix) modalPricePrefix.style.display = 'none';
    }
    if (modalPrice) modalPrice.textContent = formatBRL(promo.salePrice);

    // Parcelamento sugerido
    if (modalInstallment) {
      const parcelVal = (promo.salePrice / 3).toFixed(2).replace('.', ',');
      modalInstallment.textContent = `ou 3x de R$ ${parcelVal} sem juros`;
    }

    // Define imagem principal
    if (modalMainImg) {
      modalMainImg.src = images[0] || 'assets/images/logo-simbolo.png';
      modalMainImg.alt = product.name;
    }

    // Constrói miniaturas da galeria
    if (modalThumbnails) {
      modalThumbnails.innerHTML = '';
      if (images.length > 1) {
        images.forEach((imgUrl, idx) => {
          const thumb = document.createElement('div');
          thumb.className = `modal-thumb ${idx === 0 ? 'active' : ''}`;
          thumb.innerHTML = `<img src="${imgUrl}" alt="Foto ${idx + 1} de ${product.name}">`;
          
          thumb.addEventListener('click', () => {
            modalThumbnails.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            if (modalMainImg) modalMainImg.src = imgUrl;
            currentGalleryIndex = idx;
          });

          modalThumbnails.appendChild(thumb);
        });
        modalThumbnails.style.display = 'flex';
      } else {
        modalThumbnails.style.display = 'none';
      }
    }

    // Configuração dos Aros / Tamanhos em Estoque
    let selectedSize = null;
    const sizes = parseSizes(product.sizes);
    const allSizesEntries = Object.entries(sizes)
      .filter(([k]) => !k.startsWith('_'))
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    const availableSizes = allSizesEntries.filter(([_, qty]) => Number(qty) > 0);
    const totalStockCount = allSizesEntries.length > 0 
      ? allSizesEntries.reduce((acc, [_, q]) => acc + (Number(q) || 0), 0)
      : (Number(product.stock) || 0);

    // Se houver apenas 1 aro disponível, pré-seleciona para facilitar a compra
    if (availableSizes.length === 1) {
      selectedSize = availableSizes[0][0];
    }

    function updateWhatsappLink() {
      if (!modalWhatsappBtn) return;
      const phone = window.TENANT_WHATSAPP || (window.TENANT_CONFIG && window.TENANT_CONFIG.whatsapp_number) || '5516997990729';
      const attendant = window.TENANT_ATTENDANT || 'Carla';
      const storeName = window.TENANT_STORE_NAME || 'Soléria';
      let text = `Olá, ${attendant}! Gostaria de mais informações sobre a joia em promoção "${product.name}" (${formatBRL(promo.salePrice)}) que visualizei no catálogo ${storeName}.`;
      if (selectedSize) {
        text += ` Tenho interesse no Aro ${selectedSize}.`;
      }
      modalWhatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }

    if (modalSizesWrapper && modalSizesList) {
      if (allSizesEntries.length > 0) {
        modalSizesWrapper.style.display = 'block';
        modalSizesList.innerHTML = '';

        allSizesEntries.forEach(([size, qty]) => {
          const numQty = Number(qty) || 0;
          const isAroOutOfStock = numQty <= 0;
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `modal-size-pill ${selectedSize === size ? 'selected' : ''} ${isAroOutOfStock ? 'out-of-stock' : ''}`;
          
          if (isAroOutOfStock) {
            pill.disabled = true;
            pill.setAttribute('title', `Aro ${size} esgotado`);
            pill.innerHTML = `<span>Aro ${size}</span><span class="modal-size-stock">(Esgotado)</span>`;
          } else {
            pill.setAttribute('title', `${numQty} peça(s) disponível(is) no Aro ${size}`);
            pill.innerHTML = `<span>Aro ${size}</span><span class="modal-size-stock">(${numQty} un)</span>`;

            pill.addEventListener('click', () => {
              if (pill.classList.contains('selected')) {
                pill.classList.remove('selected');
                selectedSize = null;
              } else {
                modalSizesList.querySelectorAll('.modal-size-pill').forEach(p => p.classList.remove('selected'));
                pill.classList.add('selected');
                selectedSize = size;
              }
              updateWhatsappLink();
            });
          }

          modalSizesList.appendChild(pill);
        });
      } else {
        modalSizesWrapper.style.display = 'none';
        modalSizesList.innerHTML = '';
      }
    }

    // Atualiza link de atendimento WhatsApp
    updateWhatsappLink();

    // Configura Botão "Adicionar à Sacola"
    const btnAddToCart = document.getElementById('btn-modal-add-cart');
    if (btnAddToCart) {
      const freshCartBtn = btnAddToCart.cloneNode(true);
      btnAddToCart.parentNode.replaceChild(freshCartBtn, btnAddToCart);

      const isRing = (product.category && product.category.toLowerCase().includes('an')) || allSizesEntries.length > 0;
      const isProductSoldOut = isRing ? (availableSizes.length === 0) : (totalStockCount <= 0);

      if (isProductSoldOut) {
        freshCartBtn.disabled = true;
        freshCartBtn.classList.add('btn-modal-soldout');
        freshCartBtn.innerHTML = '<span>✦ Peça Esgotada no Momento</span>';
      } else {
        freshCartBtn.disabled = false;
        freshCartBtn.classList.remove('btn-modal-soldout');
        freshCartBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          Adicionar à Sacola
        `;

        freshCartBtn.addEventListener('click', () => {
          if (isRing && availableSizes.length > 0 && !selectedSize) {
            showToast('Por favor, selecione um Aro disponível acima antes de adicionar à sacola.', 'warning');
            return;
          }

          if (window.SoleriaCart && typeof window.SoleriaCart.add === 'function') {
            window.SoleriaCart.add(product, selectedSize, 1);
            closeModal();
          } else {
            showToast('Joia adicionada à sacola!', 'success');
            closeModal();
          }
        });
      }
    }

    // Exibe modal e previne scroll de fundo
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const modalWin = modal.querySelector('.modal-window');
    if (modalWin) modalWin.scrollTop = 0;
    const modalLayout = modal.querySelector('.modal-product-layout');
    if (modalLayout) modalLayout.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  /**
   * ========================================================================
   * LIGHTBOX DE FOTO AMPLIADA (Idêntico ao catalogo.js)
   * ========================================================================
   */
  function openLightbox(index = 0) {
    if (!lightboxModal || !lightboxImg) return;
    if (!currentProductGallery || currentProductGallery.length === 0) {
      if (modalMainImg && modalMainImg.src) {
        currentProductGallery = [modalMainImg.src];
      } else {
        return;
      }
    }

    currentGalleryIndex = Math.max(0, Math.min(index, currentProductGallery.length - 1));
    updateLightboxView();

    lightboxModal.classList.add('active');
    lightboxModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function updateLightboxView() {
    if (!lightboxImg || !currentProductGallery[currentGalleryIndex]) return;

    lightboxImg.src = currentProductGallery[currentGalleryIndex];
    lightboxImg.alt = modalTitle ? modalTitle.textContent : 'Foto da joia ampliada';

    if (lightboxCounter) {
      if (currentProductGallery.length > 1) {
        lightboxCounter.textContent = `${currentGalleryIndex + 1} de ${currentProductGallery.length}`;
        lightboxCounter.style.display = 'inline-block';
      } else {
        lightboxCounter.textContent = '1 de 1';
        lightboxCounter.style.display = 'inline-block';
      }
    }

    if (currentProductGallery.length > 1) {
      if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'flex';
      if (lightboxNextBtn) lightboxNextBtn.style.display = 'flex';
    } else {
      if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'none';
      if (lightboxNextBtn) lightboxNextBtn.style.display = 'none';
    }

    if (lightboxThumbnails) {
      lightboxThumbnails.innerHTML = '';
      if (currentProductGallery.length > 1) {
        currentProductGallery.forEach((imgUrl, idx) => {
          const thumb = document.createElement('div');
          thumb.className = `lightbox-thumb ${idx === currentGalleryIndex ? 'active' : ''}`;
          thumb.innerHTML = `<img src="${imgUrl}" alt="Miniatura ${idx + 1}">`;
          thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            currentGalleryIndex = idx;
            updateLightboxView();
            syncModalGallery();
          });
          lightboxThumbnails.appendChild(thumb);
        });
        lightboxThumbnails.style.display = 'flex';
      } else {
        lightboxThumbnails.style.display = 'none';
      }
    }
  }

  function syncModalGallery() {
    if (modalMainImg && currentProductGallery[currentGalleryIndex]) {
      modalMainImg.src = currentProductGallery[currentGalleryIndex];
    }
    if (modalThumbnails) {
      const thumbs = modalThumbnails.querySelectorAll('.modal-thumb');
      thumbs.forEach((t, i) => {
        if (i === currentGalleryIndex) t.classList.add('active');
        else t.classList.remove('active');
      });
    }
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('active');
    lightboxModal.setAttribute('aria-hidden', 'true');
    syncModalGallery();
    if (modal && modal.classList.contains('active')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  function nextLightboxImage() {
    if (currentProductGallery.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % currentProductGallery.length;
    updateLightboxView();
    syncModalGallery();
  }

  function prevLightboxImage() {
    if (currentProductGallery.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + currentProductGallery.length) % currentProductGallery.length;
    updateLightboxView();
    syncModalGallery();
  }

  function closeModal() {
    if (lightboxModal && lightboxModal.classList.contains('active')) {
      closeLightbox();
    }
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      const modalWin = modal.querySelector('.modal-window');
      if (modalWin) modalWin.scrollTop = 0;
      const modalLayout = modal.querySelector('.modal-product-layout');
      if (modalLayout) modalLayout.scrollTop = 0;
    }
    document.body.style.overflow = '';
  }

  // Abertura do lightbox ao clicar na imagem principal
  if (modalMainImageWrap) {
    modalMainImageWrap.addEventListener('click', () => {
      openLightbox(currentGalleryIndex);
    });
    modalMainImageWrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(currentGalleryIndex);
      }
    });
  } else if (modalMainImg) {
    modalMainImg.addEventListener('click', () => {
      openLightbox(currentGalleryIndex);
    });
  }

  // Listeners do Lightbox
  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightboxCloseBottom) lightboxCloseBottom.addEventListener('click', closeLightbox);
  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      prevLightboxImage();
    });
  }
  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nextLightboxImage();
    });
  }
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal || e.target === lightboxImgWrapper || (e.target && e.target.id === 'lightbox-content')) {
        closeLightbox();
      }
    });

    // Gestos touch swipe
    let touchStartX = 0;
    let touchStartY = 0;
    lightboxModal.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    lightboxModal.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) {
            nextLightboxImage();
          } else {
            prevLightboxImage();
          }
        }
      }
    }, { passive: true });
  }

  // Listeners de Fechamento do Modal do Produto
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCloseSecondary) modalCloseSecondary.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Teclas de Atalho globais (Esc, setas)
  document.addEventListener('keydown', (e) => {
    if (lightboxModal && lightboxModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeLightbox();
        return;
      }
      if (e.key === 'ArrowRight') {
        nextLightboxImage();
        return;
      }
      if (e.key === 'ArrowLeft') {
        prevLightboxImage();
        return;
      }
    }

    if (modal && modal.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeModal();
      }
    }
  });

  // Carrega produtos em promoção
  fetchPromoProducts();
});
