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

  // Elementos DOM
  const grid = document.getElementById('product-grid');
  const spinner = document.getElementById('loading-spinner');
  const emptyState = document.getElementById('empty-state');
  const categoryFiltersContainer = document.getElementById('category-filters');
  const searchInput = document.getElementById('catalog-search');
  const resetFilterBtn = document.getElementById('btn-reset-filter');

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
      description: 'Pérolas barrocas cultivadas de água doce, unidas por elos minimalistas em prata 925 com banho de ródio branco. Peça leve de caimento gracioso.',
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
          .select('id, name, category, description, sale_price, images, status, sizes')
          .eq('status', 'ativo')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erro ao buscar produtos:', error);
          showToast('Não foi possível carregar o catálogo ao vivo. Exibindo acervo demonstrativo.', 'error');
          allProducts = DEMO_PRODUCTS;
        } else if (data && data.length > 0) {
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
      const availableSizesList = Object.entries(sizes)
        .filter(([_, qty]) => Number(qty) > 0)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([size]) => size);

      const sizesPreviewHtml = availableSizesList.length > 0
        ? `<div class="card-sizes-preview">💍 Aros: ${availableSizesList.join(' · ')}</div>`
        : '';

      const card = document.createElement('article');
      card.className = 'product-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Ver detalhes de ${product.name}`);

      card.innerHTML = `
        <div class="product-card-image-box">
          <img class="product-card-img" src="${mainImgUrl}" alt="${product.name}" loading="lazy">
          ${product.category ? `<span class="product-card-category-badge">${product.category}</span>` : ''}
        </div>
        <div class="product-card-content">
          <h2 class="product-card-title">${product.name}</h2>
          <p class="product-card-desc">${product.description || ''}</p>
          ${sizesPreviewHtml}
          <div class="product-card-footer">
            <div>
              <span class="product-card-price-label">Preço</span>
              <div class="product-card-price">${formatBRL(product.sale_price)}</div>
            </div>
            <span class="product-card-action-hint">
              Detalhes &rarr;
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

    modalTitle.textContent = product.name;
    modalCategory.textContent = product.category || 'Joalheria';
    modalPrice.textContent = formatBRL(product.sale_price);
    modalDesc.textContent = product.description || 'Peça confeccionada sob encomenda com acabamentos artesanais e seleção rigorosa de gemas.';

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
    const availableSizes = Object.entries(sizes)
      .filter(([_, qty]) => Number(qty) > 0)
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    function updateWhatsappLink() {
      const phone = '5511999999999'; // Número da marca
      let text = `Olá! Gostaria de mais informações sobre a peça "${product.name}" (${formatBRL(product.sale_price)}) que visualizei no catálogo Soléria.`;
      if (selectedSize) {
        text += ` Tenho interesse no Aro ${selectedSize}.`;
      }
      modalWhatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }

    if (modalSizesWrapper && modalSizesList) {
      if (availableSizes.length > 0) {
        modalSizesWrapper.style.display = 'block';
        modalSizesList.innerHTML = '';

        availableSizes.forEach(([size, qty]) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'modal-size-pill';
          pill.setAttribute('title', `${qty} peça(s) disponível(is) no Aro ${size}`);
          pill.innerHTML = `<span>Aro ${size}</span><span class="modal-size-stock">(${qty} un)</span>`;

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

          modalSizesList.appendChild(pill);
        });
      } else {
        modalSizesWrapper.style.display = 'none';
        modalSizesList.innerHTML = '';
      }
    }

    // Configura botão de atendimento WhatsApp Concierge
    updateWhatsappLink();

    // Exibe modal
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
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

  // Navegação e estado ativo dos links do cabeçalho (Coleções & Sobre)
  const navLinks = document.querySelectorAll('.header-nav .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const sobreSection = document.getElementById('sobre');
  const colecoesSection = document.getElementById('colecoes');
  if ('IntersectionObserver' in window && sobreSection && colecoesSection) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach(link => {
            const matches = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('active', matches);
          });
        }
      });
    }, { threshold: 0.25 });

    navObserver.observe(colecoesSection);
    navObserver.observe(sobreSection);
  }

  // Inicializa carregando os dados
  fetchProducts();
});
