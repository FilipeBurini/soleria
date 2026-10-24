/**
 * ==========================================================================
 * SOLÉRIA SAAS — PERSONALIZADOR DE TEXTOS & IDENTIDADE DA LOJA
 * Permite que a dona da loja edite slogan, banner da home, WhatsApp e logo
 * sincronizando em tempo real com o servidor Master.
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpen = document.getElementById('btn-open-store-customizer');
  const modal = document.getElementById('modal-store-customizer');
  const btnClose = document.getElementById('btn-close-store-customizer');
  const btnCancel = document.getElementById('btn-cancel-store-customizer');
  const form = document.getElementById('form-store-customizer');
  const btnSave = document.getElementById('btn-save-store-customizer');

  if (!btnOpen || !modal || !form) return;

  // Campos do Formulário
  const inpBrandSubtitle = document.getElementById('cust-brand-subtitle');
  const inpHeroEyebrow = document.getElementById('cust-hero-eyebrow');
  const inpHeroTitle = document.getElementById('cust-hero-title');
  const inpHeroDesc = document.getElementById('cust-hero-desc');
  const inpAboutText = document.getElementById('cust-about-text');
  const inpWhatsapp = document.getElementById('cust-whatsapp');
  const inpAttendant = document.getElementById('cust-attendant');
  const inpLogoUrl = document.getElementById('cust-logo-url');

  function openModal() {
    const config = window.TENANT_CONFIG || {};

    if (inpBrandSubtitle) inpBrandSubtitle.value = config.brand_subtitle || '';
    if (inpHeroEyebrow) inpHeroEyebrow.value = config.hero_eyebrow || '';
    if (inpHeroTitle) inpHeroTitle.value = config.hero_title || '';
    if (inpHeroDesc) inpHeroDesc.value = config.hero_desc || '';
    if (inpAboutText) inpAboutText.value = config.about_text || '';
    if (inpWhatsapp) inpWhatsapp.value = config.whatsapp_number || '';
    if (inpAttendant) inpAttendant.value = config.attendant_name || 'Carla';
    if (inpLogoUrl) inpLogoUrl.value = config.logo_url || '';

    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.style.visibility = 'visible';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    modal.style.visibility = 'hidden';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  btnOpen.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  btnCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
  });

  // Salvar no Master de forma sincronizada
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (typeof window.saveTenantSettingsToMaster !== 'function') {
      alert('Atenção: Sistema Master de tenant não detectado neste domínio.');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Gravando alterações...';

    const payload = {
      brand_subtitle: inpBrandSubtitle?.value.trim() || null,
      hero_eyebrow: inpHeroEyebrow?.value.trim() || null,
      hero_title: inpHeroTitle?.value.trim() || null,
      hero_desc: inpHeroDesc?.value.trim() || null,
      about_text: inpAboutText?.value.trim() || null,
      whatsapp_number: inpWhatsapp?.value.trim() || null,
      attendant_name: inpAttendant?.value.trim() || 'Carla',
      logo_url: inpLogoUrl?.value.trim() || null
    };

    try {
      await window.saveTenantSettingsToMaster(payload);

      alert('✦ Sucesso! As personalizações e textos da sua loja foram atualizados e sincronizados.');
      closeModal();
    } catch (err) {
      console.error('[Store Customizer]', err);
      alert('Erro ao sincronizar personalizações: ' + (err.message || err));
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Salvar Alterações na Loja';
    }
  });
});
