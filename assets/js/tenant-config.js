/**
 * ==========================================================================
 * SOLÉRIA SAAS — BOOTLOADER DINÂMICO DE TENANT & VALIDAÇÃO DE LICENÇA
 * Este script roda antes de qualquer outro arquivo na loja parceira.
 * Ele busca a configuração da loja no seu Supabase Master e aplica:
 * • Cores da marca (CSS Variables)
 * • Logo e Ícone da loja parceira
 * • Conexão do Supabase exclusivo dela
 * • WhatsApp da loja e nome da atendente
 * • Trava de segurança caso a mensalidade esteja vencida
 * ==========================================================================
 */

// CONFIGURAÇÃO DO SEU SERVIDOR MASTER (Onde ficam cadastradas as licenças)
const MASTER_CONFIG = {
  supabaseUrl: "https://kgmkvskdhoficppjskgy.supabase.co",
  supabaseAnonKey: "sb_publishable_P-XdBQaYxckZYoussxYHFA_ZW_ZSgmq"
};

(async function initTenant() {
  try {
    // 1. Identifica a loja pelo domínio atual ou pela meta tag
    const currentDomain = window.location.hostname;
    const metaLicenseKey = document.querySelector('meta[name="tenant-license-key"]')?.getAttribute('content');

    // Se estiver rodando localmente (localhost ou 127.0.0.1) e não tiver meta tag, usa modo padrão
    if ((currentDomain === 'localhost' || currentDomain === '127.0.0.1') && !metaLicenseKey) {
      console.log('⚡ Modo Desenvolvimento Local ativo.');
      return;
    }

    // 2. Consulta o Supabase Master para obter a configuração desta loja
    let queryParam = metaLicenseKey 
      ? `license_key=eq.${encodeURIComponent(metaLicenseKey)}`
      : `domain=ilike.*${encodeURIComponent(currentDomain)}*`;

    const res = await fetch(`${MASTER_CONFIG.supabaseUrl}/rest/v1/licenses?${queryParam}&select=*`, {
      headers: {
        "apikey": MASTER_CONFIG.supabaseAnonKey,
        "Authorization": `Bearer ${MASTER_CONFIG.supabaseAnonKey}`
      }
    });

    if (!res.ok) throw new Error('Não foi possível verificar a licença.');
    const data = await res.json();
    const tenant = data && data[0];

    // 3. Se a loja não for encontrada
    if (!tenant) {
      console.warn('Licença não configurada para este domínio:', currentDomain);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const isExpired = tenant.valid_until && tenant.valid_until < today;
    const isSuspended = tenant.status !== 'active';

    // 4. Se for o painel administrativo e a licença estiver suspensa ou vencida: BLOQUEIA
    const isAdminPage = window.location.pathname.includes('admin');
    if (isAdminPage && (isExpired || isSuspended)) {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = `
          <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #141312; color: #FAF8F5; font-family: system-ui, -apple-system, sans-serif; padding: 1.5rem; text-align: center;">
            <div style="max-width: 480px; width: 100%; background: #1E1C1A; border: 1.5px solid ${tenant.primary_color || '#AB5332'}; border-radius: 12px; padding: 2.5rem 2rem; box-shadow: 0 15px 40px rgba(0,0,0,0.6);">
              <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
              <h2 style="font-size: 1.4rem; color: #FAF8F5; margin-bottom: 0.5rem; font-weight: 700;">Painel de Gestão Suspenso</h2>
              <p style="font-size: 0.88rem; color: #B5B0A6; line-height: 1.6; margin-bottom: 1.5rem;">
                A licença da loja <strong>${tenant.client_name}</strong> está com a mensalidade pendente ou venceu em <strong>${tenant.valid_until || 'Data não definida'}</strong>.
              </p>
              <div style="background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 1rem; margin-bottom: 1.75rem; font-size: 0.82rem; color: #C5BFB5;">
                Para restabelecer o acesso ao estoque, pedidos e vendas, solicite a reativação pelo WhatsApp de suporte.
              </div>
              <a href="https://wa.me/5511999999999?text=${encodeURIComponent('Olá! Gostaria de renovar a mensalidade do sistema da loja ' + tenant.client_name)}" target="_blank" style="display: inline-block; width: 100%; box-sizing: border-box; background: ${tenant.primary_color || '#AB5332'}; color: #fff; text-decoration: none; padding: 0.85rem 1.5rem; border-radius: 6px; font-weight: 700; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(0,0,0,0.3);">
                💬 Regularizar Mensalidade via WhatsApp
              </a>
            </div>
          </div>
        `;
      });
      throw new Error('Acesso administrativo bloqueado por expiração de licença.');
    }

    // 5. SE A LICENÇA ESTÁ ATIVA: Aplica todas as configurações dinâmicas!

    // A) Injeta as Cores da Marca nos tokens CSS
    const root = document.documentElement;
    if (tenant.primary_color) {
      root.style.setProperty('--brand-terracotta', tenant.primary_color);
      root.style.setProperty('--brand-terracotta-hover', tenant.primary_color);
      root.style.setProperty('--brand-gradient', `linear-gradient(135deg, ${tenant.primary_color} 0%, ${tenant.secondary_color || '#C5A465'} 100%)`);
    }
    if (tenant.secondary_color) {
      root.style.setProperty('--gold-primary', tenant.secondary_color);
      root.style.setProperty('--gold-dark', tenant.secondary_color);
    }

    // B) Aplica a conexão do Supabase da Cliente
    if (tenant.supabase_url && tenant.supabase_anon_key) {
      window.TENANT_SUPABASE_URL = tenant.supabase_url;
      window.TENANT_SUPABASE_ANON_KEY = tenant.supabase_anon_key;
    }

    // C) Aplica Dados de Atendimento da Loja
    if (tenant.whatsapp_number) window.TENANT_WHATSAPP = tenant.whatsapp_number;
    if (tenant.attendant_name) window.TENANT_ATTENDANT = tenant.attendant_name;
    if (tenant.client_name) window.TENANT_STORE_NAME = tenant.client_name;
    window.TENANT_CONFIG = tenant;

    // Função global de sincronização bidirecional com o Master
    window.saveTenantSettingsToMaster = async function(fields) {
      if (!window.TENANT_CONFIG || !window.TENANT_CONFIG.id) {
        throw new Error('Configuração de loja não encontrada para este domínio.');
      }
      const response = await fetch(`${MASTER_CONFIG.supabaseUrl}/rest/v1/licenses?id=eq.${encodeURIComponent(window.TENANT_CONFIG.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': MASTER_CONFIG.supabaseAnonKey,
          'Authorization': `Bearer ${MASTER_CONFIG.supabaseAnonKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(fields)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Falha ao salvar no servidor Master.');
      }
      const rows = await response.json();
      if (rows && rows[0]) {
        window.TENANT_CONFIG = { ...window.TENANT_CONFIG, ...rows[0] };
      }
      return rows;
    };

    // D) Aplica Logos, Títulos e Textos Customizáveis assim que o DOM carregar
    document.addEventListener('DOMContentLoaded', () => {
      // 1. Atualiza o Título da Página e Nome da Marca
      if (tenant.client_name) {
        document.title = document.title.replace(/Soléria/gi, tenant.client_name);
        document.querySelectorAll('.brand-title').forEach(el => el.textContent = tenant.client_name);
      }

      // 2. Atualiza Slogan / Subtítulo da Marca
      if (tenant.brand_subtitle) {
        document.querySelectorAll('.brand-subtitle').forEach(el => el.textContent = tenant.brand_subtitle);
      }

      // 3. Atualiza Destaque Superior do Banner (Eyebrow)
      if (tenant.hero_eyebrow) {
        const el = document.querySelector('.catalog-hero-eyebrow');
        if (el) el.textContent = tenant.hero_eyebrow;
      }

      // 4. Atualiza Título Principal do Banner
      if (tenant.hero_title) {
        const el = document.querySelector('.catalog-hero-title');
        if (el) el.textContent = tenant.hero_title;
      }

      // 5. Atualiza Texto Descritivo do Banner
      if (tenant.hero_desc) {
        const el = document.querySelector('.catalog-hero-desc');
        if (el) el.textContent = tenant.hero_desc;
      }

      // 6. Atualiza Texto "Sobre a Loja" no Rodapé
      if (tenant.about_text) {
        const el = document.querySelector('.site-footer .footer-top p');
        if (el) el.textContent = tenant.about_text;
      }

      // 7. Atualiza Nome da Atendente no botão do WhatsApp e rodapé
      if (tenant.attendant_name) {
        const btnWa = document.getElementById('modal-whatsapp-btn');
        if (btnWa && btnWa.textContent.includes('Carla')) {
          btnWa.innerHTML = btnWa.innerHTML.replace(/Carla/g, tenant.attendant_name);
        }
        const footerAtt = document.querySelector('.footer-bottom');
        if (footerAtt && footerAtt.textContent.includes('Carla')) {
          footerAtt.innerHTML = footerAtt.innerHTML.replace(/com a Carla/g, `com a ${tenant.attendant_name}`);
        }
      }

      // 8. Atualiza Imagem da Logo
      if (tenant.logo_url) {
        document.querySelectorAll('.header-logo-img, .admin-logo-img, img[alt*="Soléria"]').forEach(img => {
          img.src = tenant.logo_url;
        });
      }

      // 9. Atualiza Ícone / Favicon
      if (tenant.icon_url) {
        document.querySelectorAll('link[rel="icon"], .admin-logo-icon').forEach(el => {
          if (el.tagName === 'LINK') el.href = tenant.icon_url;
          if (el.tagName === 'IMG') el.src = tenant.icon_url;
        });
      }
    });

  } catch (err) {
    console.warn('[Tenant Bootloader]', err.message || err);
  }
})();
