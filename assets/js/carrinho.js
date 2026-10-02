/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Módulo de Sacola de Compras, Checkout Concierge e Criação de Pedidos
 */

(function () {
  const CART_STORAGE_KEY = 'soleria_shopping_bag_v1';
  let cart = [];
  let isCheckoutStep = false;

  // Carrega carrinho do LocalStorage
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) cart = JSON.parse(saved);
  } catch (e) {
    cart = [];
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
    updateHeaderBadge();
  }

  function updateHeaderBadge() {
    const count = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const badges = document.querySelectorAll('.header-cart-badge');
    badges.forEach(b => {
      b.textContent = count;
      b.classList.remove('bump');
      void b.offsetWidth; // trigger reflow
      b.classList.add('bump');
    });
  }

  function formatMoney(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function generateOrderNumber() {
    const random = Math.floor(10000 + Math.random() * 90000);
    return `SOL-${random}`;
  }

  // ==========================================================================
  // FASE 5: CUPONS DE DESCONTO & PIX COPIA E COLA
  // ==========================================================================
  let appliedCoupon = null;

  // Cupons locais de contingência caso Supabase esteja temporariamente inacessível
  const LOCAL_COUPONS = {
    'BEMVINDA10': { code: 'BEMVINDA10', discount_type: 'percentage', discount_value: 10, min_order_value: 150 },
    'LUZ15': { code: 'LUZ15', discount_type: 'percentage', discount_value: 15, min_order_value: 300 },
    'FRETEGRATIS': { code: 'FRETEGRATIS', discount_type: 'fixed', discount_value: 30, min_order_value: 200 },
    'SOLERIA50': { code: 'SOLERIA50', discount_type: 'fixed', discount_value: 50, min_order_value: 500 }
  };

  /**
   * Cálculo CRC16-CCITT (Polinômio 0x1021, Init 0xFFFF) padrão Bacen para PIX
   */
  function crc16Pix(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= (payload.charCodeAt(i) << 8);
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function emvFormat(id, value) {
    const strVal = String(value);
    const len = String(strVal.length).padStart(2, '0');
    return `${id}${len}${strVal}`;
  }

  function normalizePixKey(key) {
    if (!key) return '+5516997990729';
    const clean = key.trim();
    if (clean.includes('@') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      return clean;
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      return `+${digits}`;
    }
    return clean;
  }

  /**
   * Gera o código padrão EMVCo do Banco Central para PIX Copia e Cola
   */
  function generatePixPayload({ key = '+5516997990729', name = 'SOLERIA JOIAS', city = 'FRANCA', amount = 0, txid = '***' }) {
    const cleanKey = normalizePixKey(key);
    const cleanName = (name || 'SOLERIA JOIAS').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 25).toUpperCase();
    const cleanCity = (city || 'FRANCA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 15).toUpperCase();
    // No padrão Bacen para QR Code Estático, identificador sem PSP deve ser '***'
    const cleanTxId = (txid && txid !== 'SOLERIA' && !txid.startsWith('SOL')) ? txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) : '***';
    const amountStr = Number(amount || 0).toFixed(2);

    const gui = emvFormat('00', 'br.gov.bcb.pix');
    const pixKey = emvFormat('01', cleanKey);
    const merchantAccountInfo = emvFormat('26', gui + pixKey);

    const refLabel = emvFormat('05', cleanTxId || '***');
    const additionalData = emvFormat('62', refLabel);

    let raw = 
      emvFormat('00', '01') +
      merchantAccountInfo +
      emvFormat('52', '0000') +
      emvFormat('53', '986') +
      (Number(amount) > 0 ? emvFormat('54', amountStr) : '') +
      emvFormat('58', 'BR') +
      emvFormat('59', cleanName) +
      emvFormat('60', cleanCity) +
      additionalData +
      '6304';

    const crc = crc16Pix(raw);
    return raw + crc;
  }

  /**
   * Validação de cupom de desconto com Supabase RPC e fallback local
   */
  async function applyCouponCode(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      if (typeof showToast === 'function') showToast('Informe o código do cupom.', 'warning');
      return;
    }

    const subtotal = getCartSubtotal();
    if (subtotal <= 0) {
      if (typeof showToast === 'function') showToast('Sua sacola está vazia.', 'warning');
      return;
    }

    const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) ||
                   (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

    let result = null;
    if (client && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.rpc('validate_coupon', {
          p_code: cleanCode,
          p_subtotal: subtotal
        });
        if (!error && data) {
          result = data;
        }
      } catch (e) {
        console.warn('Falha ao validar via RPC Supabase, usando contingência local:', e);
      }
    }

    if (!result) {
      const local = LOCAL_COUPONS[cleanCode];
      if (local) {
        if (subtotal < local.min_order_value) {
          result = {
            valid: false,
            message: `Este cupom exige um pedido mínimo de ${formatMoney(local.min_order_value)}.`
          };
        } else {
          let disc = local.discount_type === 'percentage' 
            ? Math.round((subtotal * (local.discount_value / 100)) * 100) / 100 
            : local.discount_value;
          if (disc > subtotal) disc = subtotal;
          result = {
            valid: true,
            code: local.code,
            discount_type: local.discount_type,
            discount_value: local.discount_value,
            discount_amount: disc,
            final_total: subtotal - disc,
            message: `Cupom ${local.code} aplicado com sucesso!`
          };
        }
      } else {
        result = { valid: false, message: 'Cupom inválido ou expirado.' };
      }
    }

    if (result && result.valid) {
      appliedCoupon = {
        code: result.code,
        discount_type: result.discount_type,
        discount_value: result.discount_value,
        discount_amount: Number(result.discount_amount) || 0
      };
      if (typeof showToast === 'function') {
        showToast(result.message || 'Cupom aplicado com sucesso!', 'success');
      }
      renderCart();
    } else {
      if (typeof showToast === 'function') {
        showToast(result?.message || 'Cupom não pôde ser aplicado.', 'warning');
      }
    }
  }

  function removeCouponCode() {
    appliedCoupon = null;
    if (typeof showToast === 'function') {
      showToast('Cupom removido.', 'info');
    }
    renderCart();
  }


  function parseItemSizes(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  function getProductAvailableStock(product, size = null) {
    if (!product) return 999;
    const sizes = parseItemSizes(product.sizes);
    if (size && typeof sizes === 'object' && sizes[size] !== undefined) {
      return Number(sizes[size]) || 0;
    }
    const sizesValues = Object.values(sizes);
    if (sizesValues.length > 0) {
      return sizesValues.reduce((a, b) => a + (Number(b) || 0), 0);
    }
    return Number(product.stock) || 0;
  }

  /**
   * Adiciona um produto à sacola respeitando os limites de estoque
   */
  function addToCart(product, size = null, quantity = 1) {
    const price = Number(product.sale_price) || 0;
    const images = Array.isArray(product.images) ? product.images : (typeof product.images === 'string' ? [product.images] : []);
    const imgUrl = images[0] || 'assets/images/logo-simbolo.png';

    const maxAvailable = getProductAvailableStock(product, size);
    if (maxAvailable <= 0) {
      if (typeof showToast === 'function') {
        const aroText = size ? ` no Aro ${size}` : '';
        showToast(`A peça "${product.name}"${aroText} está esgotada no momento.`, 'warning');
      }
      return;
    }

    // Verifica se já existe o mesmo item e mesmo aro na sacola
    const existingIndex = cart.findIndex(item => item.id === product.id && item.size === size);

    if (existingIndex > -1) {
      const targetQty = cart[existingIndex].quantity + quantity;
      if (targetQty > maxAvailable) {
        if (typeof showToast === 'function') {
          showToast(`Limite atingido: apenas ${maxAvailable} peça(s) disponível(is) no estoque.`, 'warning');
        }
        return;
      }
      cart[existingIndex].quantity = targetQty;
      cart[existingIndex].maxStock = maxAvailable;
    } else {
      if (quantity > maxAvailable) {
        quantity = maxAvailable;
      }
      cart.push({
        id: product.id,
        name: product.name,
        sku: product.sku || 'N/A',
        category: product.category || 'Semijoias',
        size: size,
        price: price,
        image: imgUrl,
        quantity: quantity,
        maxStock: maxAvailable
      });
    }

    saveCart();
    renderCart();
    openCart();

    if (typeof showToast === 'function') {
      const aroText = size ? ` (Aro ${size})` : '';
      showToast(`"${product.name}"${aroText} adicionado à sua sacola!`, 'success');
    }
  }

  function removeFromCart(index) {
    if (index >= 0 && index < cart.length) {
      const removed = cart.splice(index, 1);
      saveCart();
      renderCart();
      if (typeof showToast === 'function' && removed[0]) {
        showToast(`Item removido da sacola.`, 'info');
      }
    }
  }

  function updateQuantity(index, delta) {
    if (index >= 0 && index < cart.length) {
      if (delta > 0 && cart[index].maxStock && cart[index].quantity >= cart[index].maxStock) {
        if (typeof showToast === 'function') {
          showToast(`Limite máximo disponível no estoque atingido (${cart[index].maxStock} un).`, 'warning');
        }
        return;
      }
      cart[index].quantity += delta;
      if (cart[index].quantity <= 0) {
        removeFromCart(index);
        return;
      }
      saveCart();
      renderCart();
    }
  }

  function getCartSubtotal() {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }

  function openCart() {
    const overlay = document.getElementById('cart-drawer-overlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeCart() {
    const overlay = document.getElementById('cart-drawer-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      // Retorna para visualização de itens ao fechar
      isCheckoutStep = false;
      renderCart();
    }
  }

  /**
   * Renderiza a sacola ou tela de finalização de pedido
   */
  function renderCart() {
    const body = document.getElementById('cart-drawer-body');
    const footer = document.getElementById('cart-drawer-footer');
    const countElem = document.getElementById('cart-drawer-count');

    if (!body || !footer) return;

    const totalItems = cart.reduce((acc, i) => acc + i.quantity, 0);
    if (countElem) countElem.textContent = `${totalItems} ${totalItems === 1 ? 'peça' : 'peças'}`;

    if (cart.length === 0) {
      body.innerHTML = `
        <div class="cart-empty-state">
          <div class="cart-empty-icon">✦</div>
          <h3 class="cart-empty-title">Sua sacola está vazia</h3>
          <p class="cart-empty-desc">Explore nossa coleção de semijoias banhadas a Ouro 18k e selecione suas peças favoritas.</p>
          <button type="button" class="btn-primary" onclick="window.SoleriaCart.close()" style="margin-top: 0.5rem;">
            Explorar Catálogo
          </button>
        </div>
      `;
      footer.style.display = 'none';
      return;
    }

    footer.style.display = 'flex';
    const subtotal = getCartSubtotal();

    // Recalcula valor do desconto caso itens da sacola tenham mudado
    let discountAmount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.discount_type === 'percentage') {
        discountAmount = Math.round((subtotal * (appliedCoupon.discount_value / 100)) * 100) / 100;
      } else {
        discountAmount = appliedCoupon.discount_value;
      }
      if (discountAmount > subtotal) discountAmount = subtotal;
      appliedCoupon.discount_amount = discountAmount;
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);
    const installmentVal = (finalTotal / 6).toFixed(2);

    // Bloco reutilizável de inserção do Cupom
    const couponHtml = `
      <div class="cart-coupon-box" style="margin: 0.85rem 0; padding: 0.75rem 0.85rem; background: #FAF8F5; border: 1px dashed #DFC9B4; border-radius: var(--radius-sm);">
        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--text-muted); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.35rem;">
          <span>✦</span> Cupom de Desconto
        </div>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <input type="text" id="cart-coupon-input" class="form-input" placeholder="Ex: BEMVINDA10" value="${appliedCoupon ? appliedCoupon.code : ''}" ${appliedCoupon ? 'disabled' : ''} style="text-transform: uppercase; font-size: 0.78rem; padding: 0.4rem 0.6rem; letter-spacing: 0.05em; background: #fff;">
          ${appliedCoupon ? `
            <button type="button" class="btn-secondary-action" id="btn-remove-coupon" style="color: #dc2626; border-color: #fca5a5; font-size: 0.75rem; padding: 0.4rem 0.75rem; white-space: nowrap;">Remover</button>
          ` : `
            <button type="button" class="btn-secondary-action" id="btn-apply-coupon" style="font-size: 0.75rem; padding: 0.4rem 0.75rem; white-space: nowrap;">Aplicar</button>
          `}
        </div>
        ${appliedCoupon ? `
          <div style="font-size: 0.73rem; color: #059669; font-weight: 600; margin-top: 0.4rem; display: flex; align-items: center; gap: 0.3rem;">
            <span>✓ Desconto de ${formatMoney(discountAmount)} ativado (${appliedCoupon.code})</span>
          </div>
        ` : ''}
      </div>
    `;

    if (isCheckoutStep) {
      // Exibe formulário de Checkout Concierge
      body.innerHTML = `
        <div class="checkout-view">
          <button type="button" class="btn-secondary-action" id="btn-back-to-items" style="align-self: flex-start; margin-bottom: 0.5rem; font-size: 0.75rem;">
            &larr; Voltar para as Peças
          </button>

          <div>
            <div class="checkout-section-title">
              <span>✦</span> Dados para Contato
            </div>
            <div class="form-group" style="margin-bottom: 0.65rem;">
              <label class="form-label">Seu Nome Completo <span class="required">*</span></label>
              <input type="text" id="order-customer-name" class="form-input" placeholder="Ex: Maria Luiza Sampaio" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.65rem;">
              <label class="form-label">WhatsApp para Atendimento <span class="required">*</span></label>
              <input type="tel" id="order-customer-phone" class="form-input" placeholder="(16) 99799-0729" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.65rem;">
              <label class="form-label">Seu CPF (para login e acompanhamento) <span class="required">*</span></label>
              <input type="text" id="order-customer-cpf" class="form-input" placeholder="000.000.000-00" maxlength="14" required inputmode="numeric">
              <span class="form-help-text">Seus pedidos e peças solicitadas ficarão vinculados ao seu CPF.</span>
            </div>
          </div>

          <div>
            <div class="checkout-section-title">
              <span>✦</span> Opção de Envio
            </div>
            <div class="delivery-options-grid">
              <button type="button" class="delivery-option-btn selected" data-delivery="entrega" id="opt-delivery-ship">
                🚚 Entrega em Domicílio
              </button>
              <button type="button" class="delivery-option-btn" data-delivery="retirada" id="opt-delivery-pickup">
                ✨ Retirada Exclusiva
              </button>
            </div>

            <!-- Avisos Transparentes sobre Política de Frete -->
            <div id="shipping-info-banner" style="margin-top: 0.65rem; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; font-size: 0.78rem; color: #92400E; display: flex; align-items: center; gap: 0.5rem;">
              <span>📦</span>
              <div>
                <strong>Envio Sob Medida:</strong> Frete Cortesia nas compras a partir de R$ 350,00 ou taxa calculada pelo CEP no WhatsApp.
              </div>
            </div>

            <div id="pickup-info-banner" style="display: none; margin-top: 0.65rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; font-size: 0.78rem; color: #166534; align-items: center; gap: 0.5rem;">
              <span>✨</span>
              <div>
                <strong>Retirada Cortesia:</strong> Sem taxa de envio. Agendamos o horário e local exclusivo pelo WhatsApp.
              </div>
            </div>

            <div id="address-fields-box">
              <div class="form-group" style="margin-bottom: 0.65rem; margin-top: 0.85rem;">
                <label class="form-label">CEP <span class="required">*</span></label>
                <div class="input-with-button">
                  <input type="text" id="order-cep" class="form-input" placeholder="00000-000">
                  <button type="button" class="btn-secondary-action" id="btn-search-cep">Buscar</button>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.5rem; margin-bottom: 0.65rem;">
                <div class="form-group">
                  <label class="form-label">Rua / Logradouro</label>
                  <input type="text" id="order-street" class="form-input" placeholder="Av. Paulista">
                </div>
                <div class="form-group">
                  <label class="form-label">Número</label>
                  <input type="text" id="order-number" class="form-input" placeholder="1000">
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.65rem;">
                <div class="form-group">
                  <label class="form-label">Bairro</label>
                  <input type="text" id="order-neighborhood" class="form-input" placeholder="Bela Vista">
                </div>
                <div class="form-group">
                  <label class="form-label">Cidade / UF</label>
                  <input type="text" id="order-city" class="form-input" placeholder="São Paulo - SP">
                </div>
              </div>
              <div class="form-group" style="margin-bottom: 0.65rem;">
                <label class="form-label">Complemento (opcional)</label>
                <input type="text" id="order-complement" class="form-input" placeholder="Apto 102, Bloco B">
              </div>
            </div>
          </div>

          <div>
            <div class="checkout-section-title">
              <span>✦</span> Observações Especiais
            </div>
            <textarea id="order-notes" class="form-textarea" rows="2" placeholder="Deseja embalagem especial para presente ou alguma instrução de entrega?"></textarea>
          </div>

          ${couponHtml}
        </div>
      `;

      // Footer no passo de checkout com detalhamento de cupom e frete
      const isFreeShipping = subtotal >= 350;
      footer.innerHTML = `
        <div class="cart-summary-line">
          <span>Subtotal das Semijoias:</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        ${discountAmount > 0 ? `
          <div class="cart-summary-line" style="color: #059669; font-weight: 600;">
            <span>Desconto (${appliedCoupon.code}):</span>
            <span>-${formatMoney(discountAmount)}</span>
          </div>
        ` : ''}
        <div class="cart-summary-line" id="summary-shipping-line">
          <span>Frete / Envio:</span>
          <span style="color: ${isFreeShipping ? '#059669' : '#92400E'}; font-weight: 600;" id="summary-shipping-val">
            ${isFreeShipping ? '✦ Frete Cortesia' : 'A combinar via WhatsApp'}
          </span>
        </div>
        <div class="cart-summary-line total">
          <span>Total do Pedido:</span>
          <span class="price">${formatMoney(finalTotal)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
          Até 6x de ${formatMoney(installmentVal)} sem juros ou via PIX com QR Code
        </div>
        <button type="button" class="btn-proceed-checkout" id="btn-submit-order">
          <span>✦ Finalizar Pedido & Gerar Protocolo</span>
        </button>
      `;

      setupCheckoutEvents();
    } else {
      // Exibe lista de itens da sacola
      let itemsHtml = '';
      cart.forEach((item, idx) => {
        itemsHtml += `
          <div class="cart-item">
            <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='assets/images/logo-simbolo.png'">
            <div class="cart-item-info">
              <div class="cart-item-name" title="${item.name}">${item.name}</div>
              ${item.size ? `<span class="cart-item-aro-tag">💍 Aro ${item.size}</span>` : ''}
              <div class="cart-item-price">${formatMoney(item.price)}</div>
            </div>
            <div class="cart-item-controls">
              <div class="cart-qty-selector">
                <button type="button" class="cart-qty-btn btn-qty-minus" data-idx="${idx}">-</button>
                <span class="cart-qty-val">${item.quantity}</span>
                <button type="button" class="cart-qty-btn btn-qty-plus" data-idx="${idx}">+</button>
              </div>
              <button type="button" class="cart-remove-btn btn-item-remove" data-idx="${idx}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Remover
              </button>
            </div>
          </div>
        `;
      });

      body.innerHTML = itemsHtml + couponHtml;

      footer.innerHTML = `
        <div class="cart-summary-line">
          <span>Subtotal:</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        ${discountAmount > 0 ? `
          <div class="cart-summary-line" style="color: #059669; font-weight: 600;">
            <span>Desconto (${appliedCoupon.code}):</span>
            <span>-${formatMoney(discountAmount)}</span>
          </div>
        ` : ''}
        <div class="cart-summary-line total">
          <span>Total:</span>
          <span class="price">${formatMoney(finalTotal)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
          Até 6x de ${formatMoney(installmentVal)} sem juros no cartão ou PIX
        </div>
        <button type="button" class="btn-proceed-checkout" id="btn-go-to-checkout">
          <span>Avançar para Entrega &rarr;</span>
        </button>
      `;

      // Event listeners dos botões de quantidade e exclusão
      body.querySelectorAll('.btn-qty-minus').forEach(b => {
        b.addEventListener('click', () => updateQuantity(Number(b.dataset.idx), -1));
      });
      body.querySelectorAll('.btn-qty-plus').forEach(b => {
        b.addEventListener('click', () => updateQuantity(Number(b.dataset.idx), 1));
      });
      body.querySelectorAll('.btn-item-remove').forEach(b => {
        b.addEventListener('click', () => removeFromCart(Number(b.dataset.idx)));
      });

      const btnGoCheckout = document.getElementById('btn-go-to-checkout');
      if (btnGoCheckout) {
        btnGoCheckout.addEventListener('click', () => {
          isCheckoutStep = true;
          renderCart();
        });
      }
    }

    // Configuração dos botões de cupom (em ambas as visualizações)
    const btnApply = document.getElementById('btn-apply-coupon');
    const inputCoupon = document.getElementById('cart-coupon-input');
    if (btnApply && inputCoupon) {
      btnApply.addEventListener('click', () => {
        applyCouponCode(inputCoupon.value);
      });
      inputCoupon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyCouponCode(inputCoupon.value);
        }
      });
    }

    const btnRemoveCoupon = document.getElementById('btn-remove-coupon');
    if (btnRemoveCoupon) {
      btnRemoveCoupon.addEventListener('click', () => {
        removeCouponCode();
      });
    }
  }

  /**
   * Configura eventos do formulário de checkout
   */
  function setupCheckoutEvents() {
    const btnBack = document.getElementById('btn-back-to-items');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        isCheckoutStep = false;
        renderCart();
      });
    }

    const optShip = document.getElementById('opt-delivery-ship');
    const optPickup = document.getElementById('opt-delivery-pickup');
    const addressBox = document.getElementById('address-fields-box');
    const shipBanner = document.getElementById('shipping-info-banner');
    const pickupBanner = document.getElementById('pickup-info-banner');
    const shipSummaryVal = document.getElementById('summary-shipping-val');
    let selectedDelivery = 'entrega';

    if (optShip && optPickup) {
      optShip.addEventListener('click', () => {
        optShip.classList.add('selected');
        optPickup.classList.remove('selected');
        selectedDelivery = 'entrega';
        if (addressBox) addressBox.style.display = 'block';
        if (shipBanner) shipBanner.style.display = 'flex';
        if (pickupBanner) pickupBanner.style.display = 'none';
        if (shipSummaryVal) {
          const sub = getCartSubtotal();
          const isFree = sub >= 350;
          shipSummaryVal.textContent = isFree ? '✦ Frete Cortesia' : 'A combinar via WhatsApp';
          shipSummaryVal.style.color = isFree ? '#059669' : '#92400E';
        }
      });

      optPickup.addEventListener('click', () => {
        optPickup.classList.add('selected');
        optShip.classList.remove('selected');
        selectedDelivery = 'retirada';
        if (addressBox) addressBox.style.display = 'none';
        if (shipBanner) shipBanner.style.display = 'none';
        if (pickupBanner) pickupBanner.style.display = 'flex';
        if (shipSummaryVal) {
          shipSummaryVal.textContent = '✦ Grátis (Retirada)';
          shipSummaryVal.style.color = '#059669';
        }
      });
    }

    // Preenche dados do cliente autenticado se houver
    if (window.SoleriaCustomer && typeof window.SoleriaCustomer.getCurrent === 'function') {
      const activeCust = window.SoleriaCustomer.getCurrent();
      if (activeCust) {
        const nameInp = document.getElementById('order-customer-name');
        const phoneInp = document.getElementById('order-customer-phone');
        const cpfInp = document.getElementById('order-customer-cpf');
        if (nameInp && !nameInp.value) nameInp.value = activeCust.name || '';
        if (phoneInp && !phoneInp.value) phoneInp.value = activeCust.phone || '';
        if (cpfInp && !cpfInp.value && activeCust.cpf) cpfInp.value = window.SoleriaCustomer.formatCPF(activeCust.cpf);

        if (activeCust.address) {
          const cepInp = document.getElementById('order-cep');
          const streetInp = document.getElementById('order-street');
          const numInp = document.getElementById('order-number');
          const compInp = document.getElementById('order-complement');
          const neighInp = document.getElementById('order-neighborhood');
          const cityInp = document.getElementById('order-city');
          if (cepInp && !cepInp.value) cepInp.value = activeCust.address.cep || '';
          if (streetInp && !streetInp.value) streetInp.value = activeCust.address.street || '';
          if (numInp && !numInp.value) numInp.value = activeCust.address.number || '';
          if (compInp && !compInp.value) compInp.value = activeCust.address.complement || '';
          if (neighInp && !neighInp.value) neighInp.value = activeCust.address.neighborhood || '';
          if (cityInp && !cityInp.value) cityInp.value = activeCust.address.city || '';
        }
      }
    }

    // Máscara de CPF
    const cpfInput = document.getElementById('order-customer-cpf');
    if (cpfInput) {
      cpfInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 9) {
          e.target.value = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        } else if (v.length > 6) {
          e.target.value = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        } else if (v.length > 3) {
          e.target.value = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        } else {
          e.target.value = v;
        }
      });
    }

    // Máscara dinâmica de telefone WhatsApp (10 ou 11 dígitos)
    const phoneInput = document.getElementById('order-customer-phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 10) {
          e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
        } else if (v.length > 6) {
          e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
        } else if (v.length > 2) {
          e.target.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
        } else if (v.length > 0) {
          e.target.value = `(${v}`;
        }
      });
    }

    // Busca de CEP via ViaCEP com máscara
    const btnSearchCep = document.getElementById('btn-search-cep');
    const cepInput = document.getElementById('order-cep');
    if (cepInput) {
      cepInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 8) v = v.slice(0, 8);
        if (v.length > 5) {
          e.target.value = `${v.slice(0, 5)}-${v.slice(5)}`;
        } else {
          e.target.value = v;
        }
      });
    }

    if (btnSearchCep && cepInput) {
      btnSearchCep.addEventListener('click', async () => {
        const cleanCep = cepInput.value.replace(/\D/g, '');
        if (cleanCep.length === 8) {
          btnSearchCep.textContent = '...';
          try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await res.json();
            if (!data.erro) {
              const street = document.getElementById('order-street');
              const neigh = document.getElementById('order-neighborhood');
              const city = document.getElementById('order-city');
              if (street) street.value = data.logradouro || '';
              if (neigh) neigh.value = data.bairro || '';
              if (city) city.value = `${data.localidade} - ${data.uf}`;
            } else {
              showToast('CEP não encontrado.', 'warning');
            }
          } catch (e) {
            showToast('Erro ao consultar CEP.', 'error');
          } finally {
            btnSearchCep.textContent = 'Buscar';
          }
        } else {
          showToast('Digite um CEP válido com 8 dígitos.', 'warning');
        }
      });
    }

    // Submissão do Pedido
    const btnSubmit = document.getElementById('btn-submit-order');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        const nameInput = document.getElementById('order-customer-name');
        const phoneField = document.getElementById('order-customer-phone');
        const notesInput = document.getElementById('order-notes');

        const cpfField = document.getElementById('order-customer-cpf');
        const rawCpf = cpfField ? cpfField.value.replace(/\D/g, '') : '';

        if (!nameInput || !nameInput.value.trim()) {
          showToast('Por favor, informe seu nome completo.', 'warning');
          nameInput.focus();
          return;
        }

        if (!phoneField || !phoneField.value.trim() || phoneField.value.replace(/\D/g, '').length < 10) {
          showToast('Por favor, informe um WhatsApp válido com DDD.', 'warning');
          phoneField.focus();
          return;
        }

        if (!rawCpf || rawCpf.length !== 11) {
          showToast('Por favor, informe um CPF válido com 11 dígitos para vincular seu pedido.', 'warning');
          if (cpfField) cpfField.focus();
          return;
        }

        const addressData = {
          delivery_type: selectedDelivery,
          cep: document.getElementById('order-cep')?.value || '',
          street: document.getElementById('order-street')?.value || '',
          number: document.getElementById('order-number')?.value || '',
          neighborhood: document.getElementById('order-neighborhood')?.value || '',
          city: document.getElementById('order-city')?.value || '',
          complement: document.getElementById('order-complement')?.value || ''
        };

        const subtotal = getCartSubtotal();
        const orderNumber = generateOrderNumber();
        const itemsCopy = [...cart];

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>Registrando seu pedido...</span>';

        const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) ||
                       (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

        // 1. Sincroniza ou cadastra automaticamente a cliente em customers
        let customerSyncResult = null;
        try {
          if (window.SoleriaCustomer && typeof window.SoleriaCustomer.syncFromCheckout === 'function') {
            customerSyncResult = await window.SoleriaCustomer.syncFromCheckout({
              name: nameInput.value.trim(),
              cpf: rawCpf,
              phone: phoneField.value.trim(),
              address: addressData
            });
          }
        } catch (cErr) {
          console.warn('Aviso ao sincronizar cliente no checkout:', cErr);
        }

        // 2. Monta payload do pedido com suporte a cupons de desconto
        const discAmount = (appliedCoupon && Number(appliedCoupon.discount_amount)) ? Number(appliedCoupon.discount_amount) : 0;
        const finalTotalOrder = Math.max(0, subtotal - discAmount);
        const couponCode = appliedCoupon ? appliedCoupon.code : null;

        const orderPayload = {
          order_number: orderNumber,
          customer_name: nameInput.value.trim(),
          customer_phone: phoneField.value.trim(),
          customer_cpf: rawCpf,
          delivery_type: selectedDelivery,
          customer_address: addressData,
          items: itemsCopy,
          subtotal: subtotal,
          discount_amount: discAmount,
          discount_code: couponCode,
          total_amount: finalTotalOrder,
          status: 'recebido',
          customer_notes: notesInput?.value.trim() || '',
          stock_deducted: true, // Deduzido de forma atômica pela trigger PostgreSQL
          stock_reserved_in_db: true,
          created_at: new Date().toISOString()
        };

        try {
          if (client && isSupabaseConfigured()) {
            const { data, error } = await client.from('orders').insert([orderPayload]);
            if (error) {
              console.warn('Aviso ao gravar em orders (verifique se executou supabase_orders.sql):', error);
            }

            // Registra uso do cupom no Supabase se houver
            if (couponCode) {
              client.rpc('record_coupon_usage', { p_code: couponCode }).catch(() => {});
            }
          }
        } catch (err) {
          console.error('Erro ao registrar no Supabase:', err);
        } finally {
          // Salva cópia de segurança em LocalStorage
          saveOrderLocally(orderPayload);
          cart = [];
          appliedCoupon = null; // Reseta cupom para próximas compras
          saveCart();
          closeCart();
          showOrderSuccessModal(orderPayload, customerSyncResult);

          // Notifica qualquer tela de catálogo aberta para atualizar estoque visual
          try {
            window.dispatchEvent(new CustomEvent('soleria-stock-updated', { detail: { order: orderPayload } }));
          } catch (e) {}
        }
      });
    }
  }

  /**
   * Abate peças do estoque dos produtos no Supabase
   */
  async function deductStockFromProducts(items, client) {
    if (!Array.isArray(items) || items.length === 0 || !client) return false;
    let anySuccess = false;
    for (const item of items) {
      if (!item.id) continue;
      const qtyToDeduct = Number(item.quantity) || 1;
      try {
        const { data: prod, error } = await client
          .from('products')
          .select('id, stock, sizes')
          .eq('id', item.id)
          .single();

        if (error || !prod) continue;

        let newStock = Number(prod.stock) || 0;
        let newSizes = parseItemSizes(prod.sizes);

        if (item.size && newSizes && typeof newSizes === 'object') {
          const curAroQty = Number(newSizes[item.size]) || 0;
          newSizes[item.size] = Math.max(0, curAroQty - qtyToDeduct);
          newStock = Object.values(newSizes).reduce((acc, q) => acc + (Number(q) || 0), 0);
          const { error: updErr } = await client
            .from('products')
            .update({ sizes: newSizes, stock: newStock })
            .eq('id', item.id);
          if (!updErr) anySuccess = true;
        } else {
          newStock = Math.max(0, newStock - qtyToDeduct);
          const { error: updErr } = await client
            .from('products')
            .update({ stock: newStock })
            .eq('id', item.id);
          if (!updErr) anySuccess = true;
        }
      } catch (e) {
        console.warn('Erro ao abater produto:', item.id, e);
      }
    }
    return anySuccess;
  }

  function saveOrderLocally(order) {
    try {
      const existing = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
      const filtered = existing.filter(o => o.order_number !== order.order_number);
      filtered.unshift(order);
      localStorage.setItem('soleria_local_orders', JSON.stringify(filtered));
    } catch (e) {}
  }

  /**
   * Exibe o modal elegante de confirmação de pedido com protocolo
   */
  function showOrderSuccessModal(order, customerSync = null) {
    let modal = document.getElementById('order-success-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'order-success-modal-overlay';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-window" style="max-width: 520px;">
          <button class="modal-close-btn" id="btn-close-order-success" aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="order-success-modal" id="order-success-content"></div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-order-success').addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    const itemsSummary = order.items.map(i => {
      const aroStr = i.size ? ` (Aro ${i.size})` : '';
      return `• ${i.quantity}x ${i.name}${aroStr} — ${formatMoney(i.price * i.quantity)}`;
    }).join('\n');

    const discountSummary = order.discount_amount > 0 
      ? `\n*Desconto (${order.discount_code}):* -${formatMoney(order.discount_amount)}` 
      : '';

    const whatsappText = `Olá, Soléria! Acabei de fazer o pedido *${order.order_number}* no catálogo:\n\n` +
      `*Cliente:* ${order.customer_name}\n` +
      `*Peças:*\n${itemsSummary}\n` +
      `${discountSummary}` +
      `*Total:* ${formatMoney(order.total_amount)}\n` +
      `*Tipo:* ${order.delivery_type === 'retirada' ? 'Retirada Exclusiva' : 'Entrega em Domicílio'}\n\n` +
      `Gostaria de confirmar o pedido e enviar o comprovante de pagamento.`;

    const phone = '5516997990729'; // WhatsApp Soléria (Carla)
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;

    // Geração do Código PIX Copia e Cola Oficial Bacen e QR Code
    const pixPayload = generatePixPayload({
      key: '+5516997990729',
      name: 'SOLERIA JOIAS',
      city: 'FRANCA',
      amount: order.total_amount,
      txid: '***'
    });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(pixPayload)}`;

    const newAccountHtml = (customerSync && customerSync.isNew) ? `
      <div style="background: #FDF9F5; border: 1.5px dashed var(--gold-primary); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin: 1rem 0; text-align: left;">
        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--brand-terracotta); font-weight: 700; display: block; margin-bottom: 0.2rem;">
          ✨ Conta Criada com Sucesso!
        </span>
        <span style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.4; display: block;">
          Seus pedidos e acervo agora estão vinculados ao seu CPF. Sua senha temporária é <strong>${customerSync.initialPassword}</strong> (4 primeiros dígitos do seu CPF).
        </span>
        <span style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-top: 0.25rem;">
          Você já está conectada e pode alterar sua senha na aba <strong>Minha Conta</strong> a qualquer momento.
        </span>
      </div>
    ` : '';

    const content = modal.querySelector('#order-success-content');
    content.innerHTML = `
      <div class="order-success-icon">✓</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.45rem; margin-bottom: 0.35rem; color: var(--text-primary);">
        Pedido Registrado com Sucesso!
      </h2>
      <p style="font-size: 0.84rem; color: var(--text-secondary); max-width: 400px; margin: 0 auto;">
        Olá, <strong>${order.customer_name}</strong>. Guarde o protocolo para rastrear a confecção e envio das suas peças.
      </p>

      <div class="order-number-banner" style="margin: 0.85rem 0;">
        <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700;">
          Número do Seu Pedido (Protocolo de Rastreio)
        </span>
        <span class="order-number-val">${order.order_number}</span>
        <button type="button" class="btn-secondary-action" id="btn-copy-protocol" style="font-size: 0.75rem; padding: 0.3rem 0.7rem;">
          Copiar Protocolo
        </button>
      </div>

      ${newAccountHtml}

      <!-- Módulo de Pagamento Instantâneo via PIX (Etapa 5.1) -->
      <div class="pix-payment-box" style="background: #FCFAF8; border: 1.5px solid #E8DFD8; border-radius: var(--radius-md); padding: 1.15rem; margin: 1.1rem 0; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <span style="font-size: 1.1rem;">💠</span>
          <span style="font-family: var(--font-serif); font-size: 1.05rem; font-weight: 700; color: var(--text-primary); letter-spacing: 0.03em;">
            Pague com PIX Instantâneo
          </span>
        </div>

        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.85rem;">
          Valor a pagar: <strong style="font-size: 1.15rem; color: var(--brand-terracotta);">${formatMoney(order.total_amount)}</strong>
          ${order.discount_amount > 0 ? `<div style="font-size: 0.72rem; color: #059669; font-weight: 600;">(Desconto de ${formatMoney(order.discount_amount)} aplicado pelo cupom ${order.discount_code})</div>` : ''}
        </div>

        <!-- QR Code -->
        <div style="display: inline-block; background: #ffffff; padding: 10px; border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); margin-bottom: 0.85rem;">
          <img src="${qrCodeUrl}" alt="QR Code PIX Soléria" style="width: 170px; height: 170px; display: block;" onerror="this.style.display='none'">
        </div>

        <div style="text-align: left; margin-top: 0.4rem;">
          <label style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.3rem;">
            Código PIX Copia e Cola
          </label>
          <div style="display: flex; gap: 0.4rem;">
            <input type="text" id="pix-copia-cola-input" readonly value="${pixPayload}" style="flex: 1; font-family: monospace; font-size: 0.72rem; background: #fff; border: 1px solid #dcd3cb; padding: 0.5rem 0.6rem; border-radius: 6px; color: #444;">
            <button type="button" id="btn-copy-pix" class="btn-proceed-checkout" style="padding: 0.5rem 0.85rem; font-size: 0.75rem; white-space: nowrap; margin-top: 0; width: auto;">
              Copiar PIX
            </button>
          </div>
          <div id="pix-copy-feedback" style="font-size: 0.72rem; color: #059669; font-weight: 600; display: none; margin-top: 0.35rem;">
            ✓ Código PIX copiado com sucesso! Abra o app do seu banco e escolha PIX Copia e Cola.
          </div>
        </div>

        <div style="font-size: 0.73rem; color: var(--text-muted); margin-top: 0.75rem; line-height: 1.4;">
          ✦ Chave PIX: <strong>(16) 99799-0729</strong> (Telefone / Carla)<br>
          Após o pagamento, envie o comprovante no WhatsApp abaixo para priorizarmos seu envio.
        </div>
      </div>

      <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-order">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8 2.53 1.09 2.53.73 2.99.69.45-.05 1.47-.6 1.68-1.18.21-.59.21-1.09.15-1.19-.06-.1-.23-.17-.48-.29z"/>
        </svg>
        Enviar Pedido / Comprovante no WhatsApp
      </a>

      <a href="rastreio.html?pedido=${order.order_number}" class="btn-secondary" style="width: 100%; display: block; text-align: center; text-decoration: none; font-size: 0.82rem; padding: 0.65rem; margin-top: 0.6rem;">
        Acompanhar Status deste Pedido &rarr;
      </a>
    `;

    const btnCopy = content.querySelector('#btn-copy-protocol');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(order.order_number).then(() => {
          btnCopy.textContent = 'Copiado!';
          setTimeout(() => { btnCopy.textContent = 'Copiar Protocolo'; }, 2000);
        });
      });
    }

    const btnCopyPix = content.querySelector('#btn-copy-pix');
    const pixFeedback = content.querySelector('#pix-copy-feedback');
    if (btnCopyPix) {
      btnCopyPix.addEventListener('click', () => {
        navigator.clipboard.writeText(pixPayload).then(() => {
          btnCopyPix.textContent = 'Copiado!';
          if (pixFeedback) pixFeedback.style.display = 'block';
          setTimeout(() => {
            btnCopyPix.textContent = 'Copiar PIX';
          }, 3000);
        }).catch(() => {
          const inputPix = content.querySelector('#pix-copia-cola-input');
          if (inputPix) {
            inputPix.select();
            document.execCommand('copy');
            btnCopyPix.textContent = 'Copiado!';
            if (pixFeedback) pixFeedback.style.display = 'block';
            setTimeout(() => { btnCopyPix.textContent = 'Copiar PIX'; }, 3000);
          }
        });
      });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Inicialização no DOM
  document.addEventListener('DOMContentLoaded', () => {
    updateHeaderBadge();

    // Eventos de abertura do carrinho
    document.querySelectorAll('.header-cart-btn, #btn-open-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        renderCart();
        openCart();
      });
    });

    // Eventos de fechamento
    const btnClose = document.getElementById('cart-drawer-close');
    if (btnClose) btnClose.addEventListener('click', closeCart);

    const overlay = document.getElementById('cart-drawer-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCart();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const ov = document.getElementById('cart-drawer-overlay');
        if (ov && ov.classList.contains('active')) closeCart();
      }
    });
  });

  // Interface global
  window.SoleriaCart = {
    add: addToCart,
    remove: removeFromCart,
    updateQty: updateQuantity,
    open: openCart,
    close: closeCart,
    render: renderCart,
    count: () => cart.reduce((acc, i) => acc + i.quantity, 0),
    items: () => cart
  };
})();
