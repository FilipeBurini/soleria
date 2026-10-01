/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Catálogo Público: Consulta produtos ativos, filtragem e modal de detalhes
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configura ano no rodapé
  const yearElem = document.getElementById('current-year');
  if (yearElem) yearElem.textContent = new Date().getFullYear();

  // Estado da aplicação
  let allProducts = [];
  let currentCategory = 'todas';
  let searchTerm = '';
  let isAdmin = false;

  // Elementos DOM
  const grid = document.getElementById('product-grid');
  const spinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const categoryFiltersContainer = document.getElementById('category-filters');
  const searchInput = document.getElementById('catalog-search');
  const resetFilterBtn = document.getElementById('btn-reset-filter');
  const catalogAdminBar = document.getElementById('catalog-admin-bar');

  // Checa se o usuário atual é um gestor autenticado no Supabase
  async function checkAdminSession() {
    try {
      if (db && isSupabaseConfigured()) {
        const { data: { session } } = await db.auth.getSession();
        if (session && session.user) {
          isAdmin = true;
          if (catalogAdminBar) catalogAdminBar.style.display = 'block';
        }
      }
    } catch (e) {
      console.log('Sessão pública (cliente)');
    }
  }
  checkAdminSession();

  // Modal DOM
  const modal = document.getElementById('product-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalMainImg = document.getElementById('modal-main-img');
  const modalThumbnails = document.getElementById('modal-thumbnails');
  const modalTitle = document.getElementById('modal-title');
  const modalCategory = document.getElementById('modal-category');
  const modalPrice = document.getElementById('modal-price');
  const modalDesc = document.getElementById('modal-description');
  const modalWhatsappBtn = document.getElementById('modal-whatsapp-btn');
  const modalSizesWrapper = document.getElementById('modal-sizes-wrapper');
  const modalSizesList = document.getElementById('modal-sizes-list');

  // Dados de demonstração caso o banco ainda esteja vazio ou em configuração
  const DEMO_PRODUCTS = [
    {
      id: 'demo-1',
      name: 'Anel Éclat Solitaire Ouro 18k',
      category: 'Anéis',
      description: 'Uma celebração à pureza geométrica. Cravejado com zircônia cúbica lapidação brilhante de 2 quilates em aro maciço banhado a ouro 18k com acabamento polido espelhado.',
      sale_price: 680.00,
      sizes: { "14": 2, "16": 3, "18": 1 },
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80'
      ],
      status: 'ativo'
    },
    {
      id: 'demo-2',
      name: 'Colar Riviera Luminance',
      category: 'Colares',
      description: 'Design fluido e atemporal. Fio contínuo com pedras selecionadas individualmente, fecho gaveta com trava de segurança oculta e banho hipoalergênico.',
      sale_price: 1240.00,
      images: [
        'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80'
      ],
      status: 'ativo'
    },
    {
      id: 'demo-3',
      name: 'Brincos Cascata de Pérolas Barrocas',
      category: 'Brincos',
      description: 'Pérolas barrocas cultivadas de água doce, unidas por elos minimalistas banhados a Ouro 18k com acabamento polido. Peça leve de caimento gracioso.',
      sale_price: 490.00,
      images: [
        'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=80'
      ],
      status: 'ativo'
    },
    {
      id: 'demo-4',
      name: 'Bracelete Tresse Royale',
      category: 'Pulseiras',
      description: 'Estrutura rígida articulada com trabalho texturizado feito à mão em técnica de corda nobre. Elegância imponente para ocasiões exclusivas.',
      sale_price: 890.00,
      images: [
        'https://images.unsplash.com/photo-1611591475152-478311396009?auto=format&fit=crop&w=800&q=80'
      ],
      status: 'ativo'
    }
  ];

  /**
   * Trata o campo de imagens (suporta Array nativo, JSON string ou URL avulsa)
   */
  function parseImages(imgField) {
    if (!imgField) return ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80'];
    if (Array.isArray(imgField)) return imgField.filter(Boolean);
    if (typeof imgField === 'string') {
      try {
        const parsed = JSON.parse(imgField);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {
        // Se for string separada por quebra de linha ou vírgula
        const list = imgField.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (list.length > 0) return list;
        return [imgField.trim()];
      }
    }
    return ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80'];
  }

  /**
   * Trata o campo de tamanhos/aros em estoque (suporta Objeto nativo ou JSON string)
   */
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

  /**
   * Calcula o preço promocional original ("De:") e a porcentagem de desconto.
   * Se o item já tiver original_price no banco, utiliza ele; caso contrário,
   * gera um valor acima realista (35% a 50% superior) e consistente baseado no item.
   */
  function calculatePromotionalPricing(product) {
    const salePrice = Number(product.sale_price) || 0;
    if (salePrice <= 0) {
      return { salePrice: 0, oldPrice: 0, discountPct: 0, hasDiscount: false };
    }

    let oldPrice = 0;
    const customOriginal = Number(product.original_price || product.compare_price);
    if (!isNaN(customOriginal) && customOriginal > salePrice) {
      oldPrice = customOriginal;
    } else {
      // Gera um valor acima consistente entre 35% e 50% acima
      let seed = 0;
      const str = String(product.id || product.name || 'soleria');
      for (let i = 0; i < str.length; i++) {
        seed = (seed + str.charCodeAt(i) * (i + 1)) % 100;
      }
      const factor = 1.35 + ((seed % 16) / 100); // Fator entre 1.35 e 1.50
      const rawPrice = salePrice * factor;

      // Arredonda para final .90 para aspecto de semijoia em oferta
      const rounded = Math.ceil(rawPrice);
      oldPrice = rounded - 0.10;
      if (oldPrice <= salePrice) {
        oldPrice = salePrice + 10 - 0.10;
      }
    }

    const discountPct = Math.round(((oldPrice - salePrice) / oldPrice) * 100);

    return {
      salePrice,
      oldPrice,
      discountPct,
      hasDiscount: oldPrice > salePrice && discountPct >= 5
    };
  }

  /**
   * Carrega os produtos do Supabase onde status = 'ativo'
   */
  async function fetchProducts() {
    spinner.style.display = 'block';
    grid.style.display = 'none';
    emptyState.style.display = 'none';

    try {
      if (db && isSupabaseConfigured()) {
        const { data, error } = await db
          .from('products')
          .select('id, name, sku, category, description, sale_price, images, status, sizes, original_price, stock')
          .eq('status', 'ativo')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erro ao buscar produtos:', error);
          showToast('Não foi possível carregar o catálogo ao vivo. Exibindo acervo demonstrativo.', 'error');
          allProducts = DEMO_PRODUCTS;
        } else if (data && data.length > 0) {
          // Busca pedidos ativos recentes para garantir reserva em tempo real
          try {
            const { data: recentOrders } = await db
              .from('orders')
              .select('id, items, status, stock_reserved_in_db')
              .neq('status', 'cancelado');

            if (recentOrders && recentOrders.length > 0) {
              const unReservedMap = {};
              recentOrders.forEach(ord => {
                if (!ord.stock_reserved_in_db && Array.isArray(ord.items)) {
                  ord.items.forEach(it => {
                    if (!it.id) return;
                    const key = it.size ? `${it.id}_size_${it.size}` : `${it.id}_total`;
                    unReservedMap[key] = (unReservedMap[key] || 0) + (Number(it.quantity) || 1);
                  });
                }
              });

              data.forEach(prod => {
                const prodSizes = parseSizes(prod.sizes);
                let sizesChanged = false;
                Object.keys(prodSizes).forEach(sz => {
                  const unDeducted = unReservedMap[`${prod.id}_size_${sz}`] || 0;
                  if (unDeducted > 0) {
                    prodSizes[sz] = Math.max(0, (Number(prodSizes[sz]) || 0) - unDeducted);
                    sizesChanged = true;
                  }
                });

                if (sizesChanged) {
                  prod.sizes = prodSizes;
                  prod.stock = Object.values(prodSizes).reduce((acc, q) => acc + (Number(q) || 0), 0);
                } else {
                  const unDeductedTotal = unReservedMap[`${prod.id}_total`] || 0;
                  if (unDeductedTotal > 0) {
                    prod.stock = Math.max(0, (Number(prod.stock) || 0) - unDeductedTotal);
                  }
                }
              });
            }
          } catch (ordErr) {
            console.warn('Verificação de pedidos ativos:', ordErr);
          }

          allProducts = data;
        } else {
          // Sem produtos ativos ainda cadastrados no banco
          allProducts = DEMO_PRODUCTS;
        }
      } else {
        // Modo demonstração pré-configuração
        allProducts = DEMO_PRODUCTS;
      }
    } catch (err) {
      console.error('Falha de conexão:', err);
      allProducts = DEMO_PRODUCTS;
    } finally {
      spinner.style.display = 'none';
      setupCategoryFilters();
      renderCatalog();
    }
  }

  /**
   * Constrói dinamicamente os botões de filtro de categoria
   */
  function setupCategoryFilters() {
    // Extrai categorias únicas
    const categories = new Set();
    allProducts.forEach(p => {
      if (p.category && p.category.trim()) {
        categories.add(p.category.trim());
      }
    });

    // Mantém o botão "Todas"
    categoryFiltersContainer.innerHTML = `
      <button class="category-pill ${currentCategory === 'todas' ? 'active' : ''}" data-category="todas">
        Todas as Peças
      </button>
    `;

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `category-pill ${currentCategory.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
      btn.dataset.category = cat;
      btn.textContent = cat;
      categoryFiltersContainer.appendChild(btn);
    });

    // Adiciona event listeners nos pills
    categoryFiltersContainer.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        categoryFiltersContainer.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        pill.classList.add('active');
        currentCategory = pill.dataset.category;
        renderCatalog();
      });
    });
  }

  /**
   * Renderiza os cards de produtos com base nos filtros ativos
   */
  function renderCatalog() {
    const filtered = allProducts.filter(p => {
      const matchesCategory = currentCategory === 'todas' || 
        (p.category && p.category.toLowerCase() === currentCategory.toLowerCase());
      
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.sku && p.sku.toLowerCase().includes(q)) || 
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
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
      const mainImgUrl = images[0] || 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80';

      const sizes = parseSizes(product.sizes);
      const sizesEntries = Object.entries(sizes);
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
      card.setAttribute('aria-label', `Ver detalhes de ${product.name}`);

      card.innerHTML = `
        <div class="product-card-image-box">
          <img class="product-card-img" src="${mainImgUrl}" alt="${product.name}" loading="lazy">
          ${isSoldOut ? `<span class="product-card-badge-soldout">Esgotado</span>` : (product.category ? `<span class="product-card-category-badge">${product.category}</span>` : '')}
          ${promo.hasDiscount && !isSoldOut ? `<span class="product-card-discount-badge">-${promo.discountPct}% OFF</span>` : ''}
        </div>
        <div class="product-card-content">
          <h2 class="product-card-title">${product.name}</h2>
          <p class="product-card-desc">${product.description || ''}</p>
          ${sizesPreviewHtml}
          <div class="product-card-footer">
            <div class="product-card-pricing-block">
              ${promo.hasDiscount ? `<span class="product-price-old">De ${formatBRL(promo.oldPrice)}</span>` : ''}
              <div class="product-card-price">
                ${promo.hasDiscount ? '<span class="price-prefix">Por</span> ' : ''}${formatBRL(promo.salePrice)}
              </div>
            </div>
            <span class="product-card-action-hint">
              ${isSoldOut ? 'Esgotado &rarr;' : 'Detalhes &rarr;'}
            </span>
          </div>
        </div>
      `;

      // Abertura do modal ao clicar ou pressionar Enter
      card.addEventListener('click', () => openProductModal(product));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openProductModal(product);
      });

      grid.appendChild(card);
    });
  }

  /**
   * Abre o modal exibindo detalhes completos e galeria
   */
  function openProductModal(product) {
    const images = parseImages(product.images);

    const promo = calculatePromotionalPricing(product);

    modalTitle.textContent = product.name;
    modalCategory.textContent = product.category || 'Semijoias';
    modalDesc.textContent = product.description || 'Semijoia de alta qualidade com banho nobre, verniz protetor e acabamento primoroso de joia.';

    // Exibe SKU discreto abaixo do nome do item
    const modalSku = document.getElementById('modal-sku');
    const modalSkuVal = document.getElementById('modal-sku-val');
    if (modalSku && modalSkuVal) {
      if (product.sku && product.sku !== 'N/A') {
        modalSkuVal.textContent = product.sku;
        modalSku.style.display = 'block';
      } else {
        modalSku.style.display = 'none';
      }
    }

    // Exibe preços promocionais no modal
    const modalPromoRow = document.getElementById('modal-promo-row');
    const modalPriceOld = document.getElementById('modal-price-old');
    const modalDiscountBadge = document.getElementById('modal-discount-badge');
    const modalPricePrefix = document.getElementById('modal-price-prefix');

    if (promo.hasDiscount) {
      if (modalPromoRow) modalPromoRow.style.display = 'flex';
      if (modalPriceOld) modalPriceOld.textContent = `De ${formatBRL(promo.oldPrice)}`;
      if (modalDiscountBadge) modalDiscountBadge.textContent = `-${promo.discountPct}% OFF`;
      if (modalPricePrefix) modalPricePrefix.style.display = 'inline';
    } else {
      if (modalPromoRow) modalPromoRow.style.display = 'none';
      if (modalPricePrefix) modalPricePrefix.style.display = 'none';
    }
    modalPrice.textContent = formatBRL(promo.salePrice);

    // Define imagem principal
    modalMainImg.src = images[0];
    modalMainImg.alt = product.name;

    // Constrói miniaturas
    modalThumbnails.innerHTML = '';
    if (images.length > 1) {
      images.forEach((imgUrl, idx) => {
        const thumb = document.createElement('div');
        thumb.className = `modal-thumb ${idx === 0 ? 'active' : ''}`;
        thumb.innerHTML = `<img src="${imgUrl}" alt="Foto ${idx + 1} de ${product.name}">`;
        
        thumb.addEventListener('click', () => {
          modalThumbnails.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
          modalMainImg.src = imgUrl;
        });

        modalThumbnails.appendChild(thumb);
      });
      modalThumbnails.style.display = 'flex';
    } else {
      modalThumbnails.style.display = 'none';
    }

    // Configuração dos Aros / Tamanhos em Estoque
    let selectedSize = null;
    const sizes = parseSizes(product.sizes);
    const allSizesEntries = Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0]));
    const availableSizes = allSizesEntries.filter(([_, qty]) => Number(qty) > 0);
    const totalStockCount = allSizesEntries.length > 0 
      ? allSizesEntries.reduce((acc, [_, q]) => acc + (Number(q) || 0), 0)
      : (Number(product.stock) || 0);

    // Se houver apenas 1 aro disponível, pré-seleciona para facilitar
    if (availableSizes.length === 1) {
      selectedSize = availableSizes[0][0];
    }

    function updateWhatsappLink() {
      const phone = '5516997990729'; // WhatsApp Soléria (Carla)
      let text = `Olá! Gostaria de mais informações sobre a peça "${product.name}" (${formatBRL(product.sale_price)}) que visualizei no catálogo Soléria.`;
      if (selectedSize) {
        text += ` Tenho interesse no Aro ${selectedSize}.`;
      }
      modalWhatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }

    // Elementos de Gestão / Baixa Rápida de Estoque
    const modalAdminActions = document.getElementById('modal-admin-actions');
    const modalAdminStockInfo = document.getElementById('modal-admin-stock-info');
    const modalAdminHelp = document.getElementById('modal-admin-help');
    let btnAdminModalDeduct = document.getElementById('btn-admin-modal-deduct');

    function updateAdminActionUI() {
      if (!modalAdminActions || !isAdmin) return;

      const currentSizes = parseSizes(product.sizes);
      const currentAvailable = Object.entries(currentSizes).filter(([_, q]) => Number(q) > 0);
      const currentTotalStock = currentAvailable.length > 0 
        ? Object.values(currentSizes).reduce((acc, q) => acc + Number(q), 0)
        : (Number(product.stock) || 0);

      if (modalAdminStockInfo) {
        modalAdminStockInfo.textContent = `Estoque: ${currentTotalStock} un`;
      }

      const isRing = (product.category && product.category.toLowerCase().includes('an')) || allSizesEntries.length > 0;

      if (!btnAdminModalDeduct) return;

      if (isRing && currentAvailable.length > 0) {
        if (selectedSize) {
          const qtyAro = Number(currentSizes[selectedSize]) || 0;
          btnAdminModalDeduct.disabled = qtyAro <= 0;
          btnAdminModalDeduct.innerHTML = `<span>⚡ Registrar Venda: Aro ${selectedSize} (-1 peça)</span>`;
          if (modalAdminHelp) {
            modalAdminHelp.textContent = `Baixa imediata no Aro ${selectedSize} (${qtyAro} un disponíveis). O saldo será subtraído do banco.`;
          }
        } else {
          btnAdminModalDeduct.disabled = true;
          btnAdminModalDeduct.innerHTML = `<span>👉 Selecione um Aro acima para dar baixa</span>`;
          if (modalAdminHelp) {
            modalAdminHelp.textContent = `Clique em um dos aros disponíveis acima para indicar qual tamanho foi vendido e dar baixa.`;
          }
        }
      } else {
        btnAdminModalDeduct.disabled = currentTotalStock <= 0;
        btnAdminModalDeduct.innerHTML = `<span>⚡ Registrar Venda (-1 peça)</span>`;
        if (modalAdminHelp) {
          modalAdminHelp.textContent = currentTotalStock > 0 
            ? `Vendeu esta peça? Clique para abater 1 unidade do estoque no sistema.`
            : `Peça sem estoque no momento.`;
        }
      }
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
              updateAdminActionUI();
            });
          }

          modalSizesList.appendChild(pill);
        });
      } else {
        modalSizesWrapper.style.display = 'none';
        modalSizesList.innerHTML = '';
      }
    }

    // Configura botão de atendimento WhatsApp Concierge
    updateWhatsappLink();

    // Configura Ações de Administrador (se logado)
    if (modalAdminActions) {
      if (isAdmin) {
        modalAdminActions.style.display = 'block';
        updateAdminActionUI();

        // Substitui listener do botão para evitar cliques duplicados
        const freshBtn = btnAdminModalDeduct.cloneNode(true);
        btnAdminModalDeduct.parentNode.replaceChild(freshBtn, btnAdminModalDeduct);
        btnAdminModalDeduct = freshBtn;

        freshBtn.addEventListener('click', async () => {
          freshBtn.disabled = true;
          freshBtn.innerHTML = `<span>Gravando baixa no estoque...</span>`;

          try {
            if (!db || !isSupabaseConfigured()) {
              showToast('Supabase não conectado.', 'error');
              updateAdminActionUI();
              return;
            }

            const currentSizes = parseSizes(product.sizes);
            const currentAvailable = Object.entries(currentSizes).filter(([_, q]) => Number(q) > 0);
            const isRing = (product.category && product.category.toLowerCase().includes('an')) || currentAvailable.length > 0;

            if (isRing && currentAvailable.length > 0) {
              if (!selectedSize) {
                showToast('Selecione um aro antes de registrar a venda.', 'warning');
                updateAdminActionUI();
                return;
              }

              const updatedSizes = { ...currentSizes };
              const currentAroQty = Number(updatedSizes[selectedSize]) || 0;
              if (currentAroQty <= 0) {
                showToast(`Aro ${selectedSize} já está esgotado!`, 'warning');
                updateAdminActionUI();
                return;
              }

              updatedSizes[selectedSize] = currentAroQty - 1;
              const newTotalStock = Object.values(updatedSizes).reduce((acc, q) => acc + Number(q), 0);

              const { error: updErr } = await db
                .from('products')
                .update({ sizes: updatedSizes, stock: newTotalStock })
                .eq('id', product.id);

              if (updErr) throw updErr;

              product.sizes = updatedSizes;
              product.stock = newTotalStock;
              showToast(`Baixa registrada! Restam ${updatedSizes[selectedSize]} un no Aro ${selectedSize}.`, 'success');

              // Atualiza o objeto na lista em memória
              const idx = allProducts.findIndex(p => p.id === product.id);
              if (idx !== -1) allProducts[idx] = product;

              openProductModal(product);
              renderCatalog();
            } else {
              const currentStock = Number(product.stock) || 1;
              const newTotalStock = Math.max(0, currentStock - 1);

              const { error: updErr } = await db
                .from('products')
                .update({ stock: newTotalStock })
                .eq('id', product.id);

              if (updErr) throw updErr;

              product.stock = newTotalStock;
              showToast(`Baixa registrada! Restam ${newTotalStock} unidades.`, 'success');

              const idx = allProducts.findIndex(p => p.id === product.id);
              if (idx !== -1) allProducts[idx] = product;

              openProductModal(product);
              renderCatalog();
            }
          } catch (err) {
            console.error('Erro ao dar baixa:', err);
            showToast('Erro ao atualizar estoque: ' + (err.message || err), 'error');
            updateAdminActionUI();
          }
        });
      } else {
        modalAdminActions.style.display = 'none';
      }
    }

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
        freshCartBtn.innerHTML = '<span>Adicionar à Sacola</span>';

        freshCartBtn.addEventListener('click', () => {
          if (isRing && availableSizes.length > 0 && !selectedSize) {
            showToast('Por favor, selecione um Aro disponível acima antes de adicionar à sacola.', 'warning');
            return;
          }

          if (window.SoleriaCart) {
            window.SoleriaCart.add(product, selectedSize, 1);
          }
        });
      }
    }

    // Exibe modal
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const modalWin = modal.querySelector('.modal-window');
    if (modalWin) modalWin.scrollTop = 0;
    document.body.style.overflow = 'hidden'; // Evita scroll do body
  }

  /**
   * Fecha o modal
   */
  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Event Listeners de Fechamento do Modal
  modalCloseBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Busca em tempo real com debounce simples
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchTerm = e.target.value.trim();
      renderCatalog();
    }, 200);
  });

  // Botão resetar busca
  resetFilterBtn.addEventListener('click', () => {
    currentCategory = 'todas';
    searchTerm = '';
    searchInput.value = '';
    categoryFiltersContainer.querySelectorAll('.category-pill').forEach((pill, idx) => {
      if (idx === 0) pill.classList.add('active');
      else pill.classList.remove('active');
    });
    renderCatalog();
  });



  // Escuta atualizações de estoque (ex: pedidos realizados na sacola)
  window.addEventListener('soleria-stock-updated', () => {
    fetchProducts();
  });

  // Inicializa carregando os dados
  fetchProducts();
});
