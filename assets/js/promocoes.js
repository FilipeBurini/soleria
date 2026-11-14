/**
 * ==========================================================================
 * SOLÉRIA — SISTEMA DE PROMOÇÕES & OFERTAS (promocoes.js)
 * Renderiza exclusivamente as joias marcadas como promocionais no estoque.
 * Integração completa com Supabase, Sacola de Compras e White-Label.
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('product-grid');
  const spinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const categoryFilters = document.getElementById('category-filters');
  const searchInput = document.getElementById('catalog-search');
  const promoCountChip = document.getElementById('promo-count-chip');

  // Modal Elements
  const modal = document.getElementById('product-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalImg = document.getElementById('modal-img');
  const modalThumbnails = document.getElementById('modal-thumbnails');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-desc');
  const modalPriceCurrent = document.getElementById('modal-price-current');
  const modalPriceOld = document.getElementById('modal-price-old');
  const modalPromoBadge = document.getElementById('modal-promo-badge');
  const modalPromoRow = document.getElementById('modal-promo-row');
  const modalCategory = document.getElementById('modal-category');
  const modalSku = document.getElementById('modal-sku');
  const modalInstallments = document.getElementById('modal-installments');
  const modalWhatsappLink = document.getElementById('modal-whatsapp-link');
  const modalAddCartBtn = document.getElementById('modal-add-cart-btn');

  // Aros
  const ringSizesWrapper = document.getElementById('modal-ring-sizes-wrapper');
  const ringGrid = document.getElementById('modal-ring-grid');
  const ringSelectedLabel = document.getElementById('modal-ring-selected-label');
  const ringHint = document.getElementById('modal-ring-hint');

  // Lightbox
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');
  const lightboxCounter = document.getElementById('lightbox-counter');

  let allPromoProducts = [];
  let currentCategory = 'todas';
  let searchTerm = '';
  let activeProduct = null;
  let selectedAro = null;
  let currentGalleryImages = [];
  let currentImageIndex = 0;
  let isManagerActive = false;

  // Verifica se administrador está logado para exibir barra de gestão
  checkAdminSession();

  async function checkAdminSession() {
    const adminBar = document.getElementById('catalog-admin-bar');
    try {
      const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || null));
      if (!client) return;
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user) {
        isManagerActive = true;
        if (adminBar) adminBar.style.display = 'block';
      }
    } catch (e) {}
  }

  // Identifica se uma joia está marcada para promoção (SOMENTE com marcação explícita do lojista)
  function isProductInPromo(prod) {
    if (!prod) return false;
    if (prod.is_promo === true || prod.is_promo === 'true' || prod.is_promo === 1) return true;
    const sizes = parseSizes(prod.sizes);
    if (sizes && (sizes._is_promo === true || sizes._is_promo === 'true' || sizes._is_promo === 1)) return true;
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
    const sizes = parseSizes(product.sizes);
    const sizesOldPrice = sizes && sizes._promo_original_price ? Number(sizes._promo_original_price) : 0;

    if (!isNaN(customOriginal) && customOriginal > salePrice) {
      oldPrice = customOriginal;
    } else if (sizesOldPrice > salePrice) {
      oldPrice = sizesOldPrice;
    } else {
      // Valor sugerido coerente (+35%) arredondado para final .90
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

  // Busca do Supabase
  async function fetchPromoProducts() {
    spinner.style.display = 'block';
    grid.style.display = 'none';
    emptyState.style.display = 'none';

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
      emptyState.style.display = 'block';
    } finally {
      spinner.style.display = 'none';
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

  // Renderiza Grid
  function renderPromoCatalog() {
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
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
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
          ${isSoldOut ? `<span class="product-card-badge-soldout">Esgotado</span>` : (product.category ? `<span class="product-card-category-badge">${product.category}</span>` : '')}
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
          <p class="product-card-desc">${product.description || ''}</p>
          ${sizesPreviewHtml}
          <div class="product-card-footer">
            <div class="product-card-pricing-block">
              ${promo.hasDiscount ? `<span class="product-price-old">De ${formatBRL(promo.oldPrice)}</span>` : ''}
              <div class="product-card-price">
                <span class="price-prefix" style="color: var(--brand-terracotta);">Por</span> ${formatBRL(promo.salePrice)}
              </div>
            </div>
            <span class="product-card-action-hint">
              ${isSoldOut ? 'Esgotado &rarr;' : 'Aproveitar &rarr;'}
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

  // Modal do Produto
  function openProductModal(product) {
    activeProduct = product;
    selectedAro = null;

    currentGalleryImages = parseImages(product.images);
    currentImageIndex = 0;

    modalImg.src = currentGalleryImages[0] || 'assets/images/logo-simbolo.png';
    modalImg.alt = product.name;

    modalThumbnails.innerHTML = '';
    if (currentGalleryImages.length > 1) {
      modalThumbnails.style.display = 'flex';
      currentGalleryImages.forEach((imgUrl, idx) => {
        const thumb = document.createElement('img');
        thumb.src = imgUrl;
        thumb.alt = `${product.name} miniatura ${idx + 1}`;
        thumb.className = `modal-thumb-img ${idx === 0 ? 'active' : ''}`;
        thumb.loading = 'lazy';
        thumb.addEventListener('click', (e) => {
          e.stopPropagation();
          currentImageIndex = idx;
          modalImg.src = imgUrl;
          modalThumbnails.querySelectorAll('.modal-thumb-img').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });
        modalThumbnails.appendChild(thumb);
      });
    } else {
      modalThumbnails.style.display = 'none';
    }

    modalSku.textContent = `SKU: ${product.sku || 'N/A'}`;
    modalCategory.textContent = product.category || 'Semijoias';
    modalTitle.textContent = product.name;
    modalDesc.textContent = product.description || 'Peça finamente trabalhada, banhada com camada nobre de Ouro 18k e verniz de proteção de alta durabilidade.';

    const promo = calculatePromotionalPricing(product);
    modalPriceCurrent.textContent = formatBRL(promo.salePrice);

    if (promo.hasDiscount) {
      modalPromoRow.style.display = 'flex';
      modalPriceOld.textContent = `De ${formatBRL(promo.oldPrice)}`;
      modalPromoBadge.textContent = `-${promo.discountPct}% OFF`;
    } else {
      modalPromoRow.style.display = 'none';
    }

    const parcelVal = (promo.salePrice / 3).toFixed(2).replace('.', ',');
    modalInstallments.textContent = `ou 3x de R$ ${parcelVal} sem juros`;

    // Grade de Aros (Anéis)
    const sizes = parseSizes(product.sizes);
    const sizeEntries = Object.entries(sizes)
      .filter(([k]) => !k.startsWith('_'))
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    const isRing = (product.category && product.category.toLowerCase().includes('an')) || sizeEntries.length > 0;

    if (isRing && sizeEntries.length > 0) {
      ringSizesWrapper.style.display = 'block';
      ringGrid.innerHTML = '';
      ringSelectedLabel.textContent = 'Nenhum selecionado';
      ringHint.textContent = 'Selecione o aro desejado para adicionar à sacola.';
      ringHint.style.color = 'var(--text-muted)';

      sizeEntries.forEach(([aro, qty]) => {
        const count = Number(qty) || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ring-size-btn ${count <= 0 ? 'disabled' : ''}`;
        btn.dataset.aro = aro;
        btn.innerHTML = `<span>${aro}</span>`;

        if (count > 0) {
          btn.addEventListener('click', () => {
            ringGrid.querySelectorAll('.ring-size-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedAro = aro;
            ringSelectedLabel.textContent = `Aro ${aro} (${count} un)`;
            ringHint.textContent = `✓ Aro ${aro} selecionado`;
            ringHint.style.color = '#2E7D32';
            updateWhatsappLink();
          });
        }
        ringGrid.appendChild(btn);
      });
    } else {
      ringSizesWrapper.style.display = 'none';
    }

    updateWhatsappLink();

    // Evento Adicionar à Sacola
    modalAddCartBtn.onclick = () => {
      if (isRing && sizeEntries.length > 0 && !selectedAro) {
        ringHint.textContent = '⚠️ Por favor, clique em um dos aros acima antes de continuar.';
        ringHint.style.color = 'var(--brand-terracotta)';
        ringSizesWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      if (window.SoleriaCart && typeof window.SoleriaCart.add === 'function') {
        window.SoleriaCart.add(activeProduct, selectedAro, 1);
        closeModal();
      } else {
        alert('Item adicionado à sua sacola!');
        closeModal();
      }
    };

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function updateWhatsappLink() {
    if (!activeProduct) return;
    const phone = (window.TENANT_CONFIG && window.TENANT_CONFIG.whatsapp_number) || '5511999998888';
    const aroText = selectedAro ? ` no tamanho Aro ${selectedAro}` : '';
    const msg = `Olá! Vi a oferta da joia "${activeProduct.name}" (SKU: ${activeProduct.sku || ''})${aroText} em promoção na Soléria por ${formatBRL(activeProduct.sale_price)} e gostaria de tirar dúvidas e finalizar a compra.`;
    modalWhatsappLink.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    activeProduct = null;
    selectedAro = null;
  }

  modalCloseBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Lightbox (Zoom da Foto)
  modalImg?.addEventListener('click', () => {
    if (currentGalleryImages.length > 0) openLightbox(currentImageIndex);
  });

  function openLightbox(index = 0) {
    if (!lightboxModal) return;
    currentImageIndex = index;
    updateLightboxView();
    lightboxModal.style.display = 'flex';
    lightboxModal.setAttribute('aria-hidden', 'false');
  }

  function updateLightboxView() {
    if (!lightboxImg || currentGalleryImages.length === 0) return;
    lightboxImg.src = currentGalleryImages[currentImageIndex];
    if (currentGalleryImages.length > 1) {
      if (lightboxCounter) {
        lightboxCounter.style.display = 'block';
        lightboxCounter.textContent = `${currentImageIndex + 1} / ${currentGalleryImages.length}`;
      }
      if (lightboxPrev) lightboxPrev.style.display = 'flex';
      if (lightboxNext) lightboxNext.style.display = 'flex';
    } else {
      if (lightboxCounter) lightboxCounter.style.display = 'none';
      if (lightboxPrev) lightboxPrev.style.display = 'none';
      if (lightboxNext) lightboxNext.style.display = 'none';
    }
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.style.display = 'none';
    lightboxModal.setAttribute('aria-hidden', 'true');
  }

  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentImageIndex = (currentImageIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    updateLightboxView();
  });
  lightboxNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentImageIndex = (currentImageIndex + 1) % currentGalleryImages.length;
    updateLightboxView();
  });
  lightboxModal?.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxModal && lightboxModal.style.display === 'flex') {
        closeLightbox();
      } else if (modal && modal.classList.contains('active')) {
        closeModal();
      }
    }
  });

  // Inicialização
  fetchPromoProducts();
});
