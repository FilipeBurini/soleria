/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Consulta e Rastreamento de Pedidos pelo Cliente (Sem Necessidade de Cadastro)
 */

document.addEventListener('DOMContentLoaded', () => {
  const trackingInput = document.getElementById('tracking-input');
  const btnSearch = document.getElementById('btn-search-order');
  const spinner = document.getElementById('tracking-spinner');
  const notFound = document.getElementById('tracking-not-found');
  const errorMsg = document.getElementById('tracking-error-msg');
  const resultBox = document.getElementById('tracking-result-box');

  const yearElem = document.getElementById('current-year');
  if (yearElem) yearElem.textContent = new Date().getFullYear();

  function formatMoney(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return 'Recentemente';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Verifica se veio parâmetro de pedido na URL (ex: rastreio.html?pedido=SOL-84920)
  const urlParams = new URLSearchParams(window.location.search);
  const paramOrder = urlParams.get('pedido') || urlParams.get('order');
  if (paramOrder && trackingInput) {
    trackingInput.value = paramOrder.trim();
    searchOrder(paramOrder.trim());
  }

  if (btnSearch && trackingInput) {
    btnSearch.addEventListener('click', () => {
      const q = trackingInput.value.trim();
      if (q) searchOrder(q);
      else showToast('Digite o número do pedido ou WhatsApp.', 'warning');
    });

    trackingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = trackingInput.value.trim();
        if (q) searchOrder(q);
      }
    });
  }

  async function searchOrder(query) {
    if (!query) return;

    spinner.style.display = 'block';
    notFound.style.display = 'none';
    resultBox.style.display = 'none';

    const cleanQ = query.toUpperCase().trim();
    const cleanDigits = query.replace(/\D/g, '');

    let foundOrder = null;

    try {
      // 1. Tenta buscar no Supabase
      if (typeof db !== 'undefined' && db && isSupabaseConfigured()) {
        // Tenta por order_number
        let { data, error } = await db
          .from('orders')
          .select('*')
          .ilike('order_number', cleanQ)
          .maybeSingle();

        if (data) {
          foundOrder = data;
        } else if (cleanDigits.length >= 8) {
          // Tenta buscar por telefone
          const phoneRes = await db
            .from('orders')
            .select('*')
            .ilike('customer_phone', `%${cleanDigits}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (phoneRes.data && phoneRes.data.length > 0) {
            foundOrder = phoneRes.data[0];
          }
        }
      }

      // 2. Se não encontrou no Supabase, tenta no LocalStorage local
      if (!foundOrder) {
        try {
          const localOrders = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
          foundOrder = localOrders.find(o => 
            (o.order_number && o.order_number.toUpperCase() === cleanQ) ||
            (cleanDigits && o.customer_phone && o.customer_phone.replace(/\D/g, '').includes(cleanDigits))
          );
        } catch (e) {}
      }

      if (foundOrder) {
        renderOrderDetails(foundOrder);
      } else {
        notFound.style.display = 'block';
        if (errorMsg) {
          errorMsg.textContent = `Nenhum pedido encontrado com a identificação "${query}". Verifique se o código ou telefone está correto.`;
        }
      }
    } catch (err) {
      console.error('Erro na consulta de rastreamento:', err);
      notFound.style.display = 'block';
      if (errorMsg) {
        errorMsg.textContent = 'Ocorreu um erro momentâneo ao conectar com o sistema. Tente novamente em instantes.';
      }
    } finally {
      spinner.style.display = 'none';
    }
  }

  function getStepIndex(status) {
    switch ((status || '').toLowerCase()) {
      case 'recebido': return 1;
      case 'confirmado': return 2;
      case 'preparacao': return 3;
      case 'enviado': return 4;
      case 'entregue': return 5;
      case 'cancelado': return -1;
      default: return 1;
    }
  }

  function getStatusLabel(status) {
    switch ((status || '').toLowerCase()) {
      case 'recebido': return { label: 'Pedido Recebido', class: 'status-recebido' };
      case 'confirmado': return { label: 'Pagamento Confirmado', class: 'status-confirmado' };
      case 'preparacao': return { label: 'Em Preparação', class: 'status-preparacao' };
      case 'enviado': return { label: 'Enviado / A Caminho', class: 'status-enviado' };
      case 'entregue': return { label: 'Entregue & Concluído', class: 'status-entregue' };
      case 'cancelado': return { label: 'Cancelado', class: 'status-cancelado' };
      default: return { label: 'Em Análise', class: 'status-recebido' };
    }
  }

  function renderOrderDetails(order) {
    const statusInfo = getStatusLabel(order.status);
    const stepIdx = getStepIndex(order.status);
    const isCancelled = order.status === 'cancelado';

    const items = Array.isArray(order.items) ? order.items : [];
    const addr = order.customer_address || {};

    // Calcula progresso da linha do tempo
    const progressPct = isCancelled ? 0 : Math.max(0, Math.min(100, ((stepIdx - 1) / 4) * 100));

    let timelineHtml = '';
    if (!isCancelled) {
      timelineHtml = `
        <div class="tracking-timeline">
          <div class="tracking-timeline-progress" style="width: calc(${progressPct}% * 0.85);"></div>
          
          <div class="timeline-step ${stepIdx > 1 ? 'completed' : (stepIdx === 1 ? 'active' : '')}">
            <div class="timeline-step-circle">✦</div>
            <div class="timeline-step-label">Recebido</div>
          </div>

          <div class="timeline-step ${stepIdx > 2 ? 'completed' : (stepIdx === 2 ? 'active' : '')}">
            <div class="timeline-step-circle">💳</div>
            <div class="timeline-step-label">Pagamento</div>
          </div>

          <div class="timeline-step ${stepIdx > 3 ? 'completed' : (stepIdx === 3 ? 'active' : '')}">
            <div class="timeline-step-circle">📦</div>
            <div class="timeline-step-label">Preparação</div>
          </div>

          <div class="timeline-step ${stepIdx > 4 ? 'completed' : (stepIdx === 4 ? 'active' : '')}">
            <div class="timeline-step-circle">🚚</div>
            <div class="timeline-step-label">A Caminho</div>
          </div>

          <div class="timeline-step ${stepIdx >= 5 ? 'completed active' : ''}">
            <div class="timeline-step-circle">✨</div>
            <div class="timeline-step-label">Entregue</div>
          </div>
        </div>
      `;
    } else {
      timelineHtml = `
        <div style="background: #FEE2E2; border: 1px solid #F87171; border-radius: var(--radius-sm); padding: 1.25rem; text-align: center; margin: 1.5rem 0;">
          <h4 style="color: #991B1B; margin-bottom: 0.25rem;">Pedido Cancelado</h4>
          <p style="font-size: 0.82rem; color: #7F1D1D; margin: 0;">
            Este pedido foi cancelado. Se você tiver dúvidas ou desejar reativá-lo, fale com nossa equipe no WhatsApp.
          </p>
        </div>
      `;
    }

    // Código de rastreamento se houver
    let trackingCodeHtml = '';
    if (order.tracking_code) {
      const correiosUrl = `https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(order.tracking_code)}`;
      trackingCodeHtml = `
        <div style="background: #F0FDF4; border: 1px solid #86EFAC; border-radius: var(--radius-sm); padding: 1rem; margin: 1.25rem 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #166534; display: block;">Código de Rastreamento Correios / Envio:</span>
            <strong style="font-family: monospace; font-size: 1.1rem; color: #14532D;">${order.tracking_code}</strong>
          </div>
          <a href="${correiosUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary-action" style="font-size: 0.78rem;">
            Rastrear nos Correios &rarr;
          </a>
        </div>
      `;
    }

    // Lista de Itens do Pedido
    let itemsRowsHtml = '';
    items.forEach(item => {
      const aroBadge = item.size ? `<span class="cart-item-aro-tag" style="margin-left: 0.35rem;">Aro ${item.size}</span>` : '';
      itemsRowsHtml += `
        <div style="display: flex; gap: 1rem; align-items: center; padding: 0.85rem 0; border-bottom: 1px solid var(--border-subtle);">
          <img src="${item.image || 'assets/images/logo-simbolo.png'}" alt="${item.name}" style="width: 55px; height: 55px; border-radius: var(--radius-sm); object-fit: cover; background: #FAF8F5;" onerror="this.src='assets/images/logo-simbolo.png'">
          <div style="flex-grow: 1;">
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${item.name} ${aroBadge}</div>
            <div style="font-size: 0.78rem; color: var(--text-secondary);">${item.quantity}x de ${formatMoney(item.price)}</div>
          </div>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--gold-dark);">${formatMoney(item.price * item.quantity)}</div>
        </div>
      `;
    });

    const phone = '5511999999999';
    const waHelpMsg = `Olá! Gostaria de informações sobre meu pedido *${order.order_number}* em nome de ${order.customer_name}.`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(waHelpMsg)}`;

    resultBox.innerHTML = `
      <div class="tracking-search-card" style="margin-top: 1.5rem;">
        
        <!-- Topo com Número e Status -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem;">
          <div>
            <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Protocolo de Pedido</span>
            <h2 style="font-family: monospace; font-size: 1.5rem; color: var(--brand-terracotta); margin: 0.15rem 0;">
              ${order.order_number}
            </h2>
            <span style="font-size: 0.78rem; color: var(--text-secondary);">Realizado em: ${formatDate(order.created_at)}</span>
          </div>
          <div>
            <span class="order-badge ${statusInfo.class}">
              ${statusInfo.label}
            </span>
          </div>
        </div>

        <!-- Linha do Tempo -->
        ${timelineHtml}

        <!-- Código de Rastreio -->
        ${trackingCodeHtml}

        <!-- Informações do Cliente & Envio -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin: 1.5rem 0; padding: 1.25rem; background: #FCFBF9; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
          <div>
            <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">
              Dados da Cliente
            </span>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${order.customer_name}</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary);">${order.customer_phone}</div>
          </div>
          <div>
            <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">
              Modalidade & Entrega
            </span>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem;">
              ${order.delivery_type === 'retirada' ? '✨ Retirada Exclusiva Soléria' : '🚚 Entrega em Domicílio'}
            </div>
            ${order.delivery_type !== 'retirada' && addr.street ? `
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
                ${addr.street}, ${addr.number || 'S/N'} ${addr.complement ? `(${addr.complement})` : ''}<br>
                ${addr.neighborhood || ''} — ${addr.city || ''} ${addr.cep ? `| CEP ${addr.cep}` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Lista de Produtos -->
        <div style="margin-top: 1.5rem;">
          <h3 style="font-family: var(--font-serif); font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-primary);">
            Peças do Pedido (${items.length})
          </h3>
          <div>${itemsRowsHtml}</div>
          
          <div style="display: flex; justify-content: flex-end; margin-top: 1rem; font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">
            Total: <span style="color: var(--gold-dark); margin-left: 0.5rem;">${formatMoney(order.total_amount)}</span>
          </div>
        </div>

        <!-- Botão WhatsApp Suporte -->
        <div style="margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <span style="font-size: 0.82rem; color: var(--text-secondary);">
            Dúvidas sobre a entrega ou pagamento?
          </span>
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-order" style="width: auto; padding: 0.65rem 1.25rem; font-size: 0.82rem; margin: 0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8 2.53 1.09 2.53.73 2.99.69.45-.05 1.47-.6 1.68-1.18.21-.59.21-1.09.15-1.19-.06-.1-.23-.17-.48-.29z"/>
            </svg>
            Falar com Concierge no WhatsApp
          </a>
        </div>

      </div>
    `;

    resultBox.style.display = 'block';
  }
});
