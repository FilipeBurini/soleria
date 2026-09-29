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

  /**
   * Adiciona um produto à sacola
   */
  function addToCart(product, size = null, quantity = 1) {
    const price = Number(product.sale_price) || 0;
    const images = Array.isArray(product.images) ? product.images : (typeof product.images === 'string' ? [product.images] : []);
    const imgUrl = images[0] || 'assets/images/logo-simbolo.png';

    // Verifica se já existe o mesmo item e mesmo aro na sacola
    const existingIndex = cart.findIndex(item => item.id === product.id && item.size === size);

    if (existingIndex > -1) {
      cart[existingIndex].quantity += quantity;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        sku: product.sku || 'N/A',
        category: product.category || 'Semijoias',
        size: size,
        price: price,
        image: imgUrl,
        quantity: quantity
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
    const installmentVal = (subtotal / 6).toFixed(2);

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
              <input type="tel" id="order-customer-phone" class="form-input" placeholder="(11) 99999-9999" required>
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

            <div id="address-fields-box">
              <div class="form-group" style="margin-bottom: 0.65rem;">
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
        </div>
      `;

      // Footer no passo de checkout
      footer.innerHTML = `
        <div class="cart-summary-line">
          <span>Subtotal das Semijoias:</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        <div class="cart-summary-line total">
          <span>Total do Pedido:</span>
          <span class="price">${formatMoney(subtotal)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
          Até 6x de ${formatMoney(installmentVal)} sem juros
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

      body.innerHTML = itemsHtml;

      footer.innerHTML = `
        <div class="cart-summary-line">
          <span>Subtotal:</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        <div class="cart-summary-line total">
          <span>Total:</span>
          <span class="price">${formatMoney(subtotal)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
          Até 6x de ${formatMoney(installmentVal)} sem juros no cartão
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
    let selectedDelivery = 'entrega';

    if (optShip && optPickup) {
      optShip.addEventListener('click', () => {
        optShip.classList.add('selected');
        optPickup.classList.remove('selected');
        selectedDelivery = 'entrega';
        if (addressBox) addressBox.style.display = 'block';
      });

      optPickup.addEventListener('click', () => {
        optPickup.classList.add('selected');
        optShip.classList.remove('selected');
        selectedDelivery = 'retirada';
        if (addressBox) addressBox.style.display = 'none';
      });
    }

    // Busca de CEP via ViaCEP
    const btnSearchCep = document.getElementById('btn-search-cep');
    const cepInput = document.getElementById('order-cep');
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
        const phoneInput = document.getElementById('order-customer-phone');
        const notesInput = document.getElementById('order-notes');

        if (!nameInput || !nameInput.value.trim()) {
          showToast('Por favor, informe seu nome completo.', 'warning');
          nameInput.focus();
          return;
        }

        if (!phoneInput || !phoneInput.value.trim() || phoneInput.value.replace(/\D/g, '').length < 10) {
          showToast('Por favor, informe um WhatsApp válido com DDD.', 'warning');
          phoneInput.focus();
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

        const orderPayload = {
          order_number: orderNumber,
          customer_name: nameInput.value.trim(),
          customer_phone: phoneInput.value.trim(),
          delivery_type: selectedDelivery,
          customer_address: addressData,
          items: itemsCopy,
          subtotal: subtotal,
          total_amount: subtotal,
          status: 'recebido',
          customer_notes: notesInput?.value.trim() || '',
          created_at: new Date().toISOString()
        };

        try {
          if (typeof db !== 'undefined' && db && isSupabaseConfigured()) {
            const { data, error } = await db.from('orders').insert([orderPayload]);
            if (error) {
              console.warn('Aviso ao gravar em orders (verifique se executou supabase_orders.sql):', error);
              // Salva cópia de segurança em LocalStorage
              saveOrderLocally(orderPayload);
            }
          } else {
            saveOrderLocally(orderPayload);
          }

          // Limpa carrinho
          cart = [];
          saveCart();
          closeCart();

          // Exibe modal de confirmação de pedido
          showOrderSuccessModal(orderPayload);
        } catch (err) {
          console.error('Erro ao finalizar pedido:', err);
          saveOrderLocally(orderPayload);
          cart = [];
          saveCart();
          closeCart();
          showOrderSuccessModal(orderPayload);
        }
      });
    }
  }

  function saveOrderLocally(order) {
    try {
      const existing = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
      existing.unshift(order);
      localStorage.setItem('soleria_local_orders', JSON.stringify(existing));
    } catch (e) {}
  }

  /**
   * Exibe o modal elegante de confirmação de pedido com protocolo
   */
  function showOrderSuccessModal(order) {
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
              <line x1="6" y1="6" x2="18" y2="6"></line>
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

    const whatsappText = `Olá, Soléria! Acabei de fazer o pedido *${order.order_number}* no catálogo:\n\n` +
      `*Cliente:* ${order.customer_name}\n` +
      `*Peças:*\n${itemsSummary}\n\n` +
      `*Total:* ${formatMoney(order.total_amount)}\n` +
      `*Tipo:* ${order.delivery_type === 'retirada' ? 'Retirada Exclusiva' : 'Entrega em Domicílio'}\n\n` +
      `Gostaria de confirmar os detalhes e combinar o pagamento.`;

    const phone = '5511999999999'; // Número da marca
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;

    const content = modal.querySelector('#order-success-content');
    content.innerHTML = `
      <div class="order-success-icon">✓</div>
      <h2 style="font-family: var(--font-serif); font-size: 1.5rem; margin-bottom: 0.35rem; color: var(--text-primary);">
        Pedido Registrado com Sucesso!
      </h2>
      <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 380px; margin: 0 auto;">
        Olá, <strong>${order.customer_name}</strong>. Guarde o número do seu pedido para consultar o andamento a qualquer momento.
      </p>

      <div class="order-number-banner">
        <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700;">
          Número do Seu Pedido (Protocolo de Rastreio)
        </span>
        <span class="order-number-val">${order.order_number}</span>
        <button type="button" class="btn-secondary-action" id="btn-copy-protocol" style="font-size: 0.75rem; padding: 0.3rem 0.7rem;">
          Copiar Número
        </button>
      </div>

      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Para agilizar o envio das suas semijoias, envie os detalhes diretamente para o nosso atendimento exclusivo no WhatsApp:
      </p>

      <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-order">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8 2.53 1.09 2.53.73 2.99.69.45-.05 1.47-.6 1.68-1.18.21-.59.21-1.09.15-1.19-.06-.1-.23-.17-.48-.29z"/>
        </svg>
        Enviar Pedido no WhatsApp da Soléria
      </a>

      <a href="rastreio.html?pedido=${order.order_number}" class="btn-secondary" style="width: 100%; display: block; text-align: center; text-decoration: none; font-size: 0.82rem; padding: 0.65rem;">
        Acompanhar Status deste Pedido &rarr;
      </a>
    `;

    const btnCopy = content.querySelector('#btn-copy-protocol');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(order.order_number).then(() => {
          btnCopy.textContent = 'Copiado!';
          setTimeout(() => { btnCopy.textContent = 'Copiar Número'; }, 2000);
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
