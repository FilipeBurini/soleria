/**
 * SOLÉRIA MASTER — GESTÃO DE LOJAS & LICENÇAS WHITE-LABEL
 * Permite cadastrar lojas parceiras, configurar bancos exclusivos,
 * aplicar cores/logos dinâmicas e controlar as mensalidades.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (window.db || null));

  // Elementos do DOM
  const tbody = document.getElementById('licenses-tbody');
  const searchInput = document.getElementById('filter-search-license');
  const modal = document.getElementById('modal-license');
  const modalTitle = document.getElementById('modal-license-title');
  const form = document.getElementById('form-license');
  const btnOpenCreate = document.getElementById('btn-open-create-license');
  const btnCloseModal = document.getElementById('btn-close-license-modal');
  const btnCancelModal = document.getElementById('btn-cancel-license-modal');
  const btnGenerateKey = document.getElementById('btn-generate-key');

  // KPIs
  const kpiActive = document.getElementById('kpi-active-stores');
  const kpiExpiring = document.getElementById('kpi-expiring-stores');
  const kpiSuspended = document.getElementById('kpi-suspended-stores');
  const kpiMrr = document.getElementById('kpi-mrr-total');

  // Campos do Formulário
  const inpId = document.getElementById('license-id');
  const inpClientName = document.getElementById('lic-client-name');
  const inpDomain = document.getElementById('lic-domain');
  const inpKey = document.getElementById('lic-key');
  const inpSupabaseUrl = document.getElementById('lic-supabase-url');
  const inpSupabaseAnon = document.getElementById('lic-supabase-anon');
  const inpLogoUrl = document.getElementById('lic-logo-url');
  const inpIconUrl = document.getElementById('lic-icon-url');
  const inpPrimaryColor = document.getElementById('lic-primary-color');
  const inpPrimaryPicker = document.getElementById('lic-primary-color-picker');
  const inpSecondaryColor = document.getElementById('lic-secondary-color');
  const inpSecondaryPicker = document.getElementById('lic-secondary-color-picker');
  const inpWhatsapp = document.getElementById('lic-whatsapp');
  const inpAttendant = document.getElementById('lic-attendant');
  const inpMonthlyFee = document.getElementById('lic-monthly-fee');
  const inpValidUntil = document.getElementById('lic-valid-until');
  const inpStatus = document.getElementById('lic-status');

  let licensesData = [];

  // Sincroniza Color Pickers com inputs de texto
  inpPrimaryPicker?.addEventListener('input', () => inpPrimaryColor.value = inpPrimaryPicker.value.toUpperCase());
  inpPrimaryColor?.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(inpPrimaryColor.value)) inpPrimaryPicker.value = inpPrimaryColor.value;
  });

  inpSecondaryPicker?.addEventListener('input', () => inpSecondaryColor.value = inpSecondaryPicker.value.toUpperCase());
  inpSecondaryColor?.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(inpSecondaryColor.value)) inpSecondaryPicker.value = inpSecondaryColor.value;
  });

  // Gerador de Chave Automática
  btnGenerateKey?.addEventListener('click', () => {
    const storeName = inpClientName.value.trim().split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '') || 'LOJA';
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const year = new Date().getFullYear();
    inpKey.value = `SLR-${storeName}-${randomHex}-${year}`;
  });

  // Helper de Formatação
  function formatMoney(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }

  // Carrega Licenças do Supabase Master
  async function loadLicenses() {
    try {
      if (!client) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #DC2626; padding: 2rem;">Supabase Master não inicializado. Verifique supabase.js</td></tr>`;
        return;
      }

      const { data, error } = await client.from('licenses').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      licensesData = data || [];
      renderKPIs(licensesData);
      renderTable(licensesData);
    } catch (err) {
      console.error('Erro ao carregar licenças:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #DC2626; padding: 2rem;">Erro ao carregar licenças: ${err.message || err}. Verifique se a tabela 'licenses' foi criada.</td></tr>`;
    }
  }

  // Atualiza Métricas
  function renderKPIs(list) {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);

    let activeCount = 0;
    let suspendedCount = 0;
    let expiringCount = 0;
    let mrrTotal = 0;

    list.forEach(lic => {
      const validDate = new Date(lic.valid_until + 'T23:59:59');
      const isExpired = validDate < today;

      if (lic.status === 'active' && !isExpired) {
        activeCount++;
        mrrTotal += Number(lic.monthly_fee || 0);

        if (validDate <= in7Days) {
          expiringCount++;
        }
      } else {
        suspendedCount++;
      }
    });

    if (kpiActive) kpiActive.textContent = activeCount;
    if (kpiExpiring) kpiExpiring.textContent = expiringCount;
    if (kpiSuspended) kpiSuspended.textContent = suspendedCount;
    if (kpiMrr) kpiMrr.textContent = formatMoney(mrrTotal);
  }

  // Renderiza Tabela de Lojas
  function renderTable(list) {
    const term = (searchInput?.value || '').toLowerCase().trim();
    const filtered = list.filter(l => 
      (l.client_name || '').toLowerCase().includes(term) ||
      (l.domain || '').toLowerCase().includes(term) ||
      (l.license_key || '').toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhuma loja parceira encontrada.</td></tr>`;
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tbody.innerHTML = filtered.map(lic => {
      const isExpired = lic.valid_until && lic.valid_until < todayStr;
      let statusBadge = '';

      if (lic.status === 'active' && !isExpired) {
        statusBadge = `<span style="background: #DCFCE7; color: #15803D; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.72rem;">🟢 Ativa</span>`;
      } else if (lic.status === 'active' && isExpired) {
        statusBadge = `<span style="background: #FEF3C7; color: #92400E; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.72rem;">🟡 Vencida</span>`;
      } else {
        statusBadge = `<span style="background: #FEE2E2; color: #991B1B; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.72rem;">🔴 Suspensa</span>`;
      }

      const logoThumb = lic.logo_url 
        ? `<img src="${lic.logo_url}" style="height: 24px; max-width: 70px; object-fit: contain; margin-right: 0.35rem;" onerror="this.style.display='none'">` 
        : '';

      const colorChips = `
        <div style="display: flex; align-items: center; gap: 4px;">
          <span title="Cor Primária: ${lic.primary_color}" style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${lic.primary_color || '#AB5332'}; border: 1px solid rgba(0,0,0,0.15);"></span>
          <span title="Cor Secundária: ${lic.secondary_color}" style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${lic.secondary_color || '#C5A465'}; border: 1px solid rgba(0,0,0,0.15);"></span>
        </div>
      `;

      return `
        <tr style="border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem;">
          <td style="padding: 0.85rem 1rem;">
            <strong style="color: var(--text-primary); font-size: 0.95rem; display: block;">${lic.client_name}</strong>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Atendente: ${lic.attendant_name || 'Carla'} (${lic.whatsapp_number || 'Sem WhatsApp'})</span>
          </td>
          <td style="padding: 0.85rem 1rem;">
            <a href="https://${lic.domain}" target="_blank" style="color: var(--brand-terracotta); font-weight: 600; text-decoration: none;">
              ${lic.domain} ↗
            </a>
            <div style="font-family: monospace; font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
              Key: ${lic.license_key}
            </div>
          </td>
          <td style="padding: 0.85rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${logoThumb}
              ${colorChips}
            </div>
          </td>
          <td style="padding: 0.85rem 1rem; font-weight: 600; color: var(--text-primary);">
            ${formatMoney(lic.monthly_fee)}/mês
          </td>
          <td style="padding: 0.85rem 1rem; color: ${isExpired ? '#DC2626' : 'var(--text-secondary)'}; font-weight: ${isExpired ? '700' : 'normal'};">
            ${formatDate(lic.valid_until)}
          </td>
          <td style="padding: 0.85rem 1rem;">
            ${statusBadge}
          </td>
          <td style="padding: 0.85rem 1rem; text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem; align-items: center;">
              <button type="button" class="btn-action-renew" data-id="${lic.id}" title="Prorrogar +30 dias de mensalidade" style="background: #F0FDF4; border: 1px solid #86EFAC; color: #166534; font-size: 0.74rem; padding: 0.35rem 0.65rem; border-radius: 4px; cursor: pointer; font-weight: 600;">
                ⚡ +30 Dias
              </button>
              <button type="button" class="btn-action-edit" data-id="${lic.id}" title="Editar Parâmetros (Cores, Logo, Banco, Chave)" style="background: #FAF8F5; border: 1px solid var(--border-medium); color: var(--text-primary); font-size: 0.74rem; padding: 0.35rem 0.65rem; border-radius: 4px; cursor: pointer;">
                ✏️ Editar
              </button>
              <button type="button" class="btn-action-toggle" data-id="${lic.id}" data-status="${lic.status}" title="${lic.status === 'active' ? 'Suspender Loja' : 'Reativar Loja'}" style="background: #fff; border: 1px solid ${lic.status === 'active' ? '#FECACA' : '#BBF7D0'}; color: ${lic.status === 'active' ? '#DC2626' : '#166534'}; font-size: 0.74rem; padding: 0.35rem 0.65rem; border-radius: 4px; cursor: pointer;">
                ${lic.status === 'active' ? '🔒 Bloquear' : '🔓 Liberar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    bindActionButtons();
  }

  // Interatividade dos Botões de Ação da Tabela
  function bindActionButtons() {
    // 1. Prorrogar +30 Dias (Renovar Mensalidade Pix)
    document.querySelectorAll('.btn-action-renew').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const lic = licensesData.find(l => l.id === id);
        if (!lic) return;

        let baseDate = new Date();
        if (lic.valid_until) {
          const curr = new Date(lic.valid_until + 'T23:59:59');
          if (curr > baseDate) baseDate = curr; // Se ainda não venceu, soma a partir da validade atual
        }
        baseDate.setDate(baseDate.getDate() + 30);
        const newValidUntil = baseDate.toISOString().split('T')[0];

        if (!confirm(`Confirmar recebimento do Pix e prorrogar a loja "${lic.client_name}" por mais 30 dias (até ${formatDate(newValidUntil)})?`)) return;

        btn.disabled = true;
        btn.textContent = 'Gravando...';

        const { error } = await client.from('licenses').update({
          valid_until: newValidUntil,
          status: 'active'
        }).eq('id', id);

        if (error) {
          alert('Erro ao prorrogar: ' + error.message);
        } else {
          loadLicenses();
        }
      });
    });

    // 2. Editar Parâmetros da Loja
    document.querySelectorAll('.btn-action-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const lic = licensesData.find(l => String(l.id) === String(id));
        if (!lic) {
          console.warn('Loja não encontrada para edição. ID:', id, 'Lista:', licensesData);
          return;
        }
        openModal(lic);
      });
    });

    // 3. Alternar Bloqueio / Desbloqueio
    document.querySelectorAll('.btn-action-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const currentStatus = btn.dataset.status;
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        const actionLabel = newStatus === 'active' ? 'desbloquear' : 'bloquear';

        if (!confirm(`Deseja realmente ${actionLabel} o acesso ao painel da loja selecionada?`)) return;

        btn.disabled = true;
        const { error } = await client.from('licenses').update({ status: newStatus }).eq('id', id);
        if (error) {
          alert('Erro ao alterar status: ' + error.message);
        } else {
          loadLicenses();
        }
      });
    });
  }

  // Abrir Modal de Criação ou Edição
  function openModal(lic = null) {
    if (!modal) {
      console.error('Elemento #modal-license não encontrado no DOM!');
      alert('Erro: Modal não encontrado no DOM.');
      return;
    }

    form.reset();

    if (lic) {
      modalTitle.textContent = `Editar Parâmetros: ${lic.client_name}`;
      inpId.value = lic.id || '';
      inpClientName.value = lic.client_name || '';
      inpDomain.value = lic.domain || '';
      inpKey.value = lic.license_key || '';
      inpSupabaseUrl.value = lic.supabase_url || '';
      inpSupabaseAnon.value = lic.supabase_anon_key || '';
      inpLogoUrl.value = lic.logo_url || '';
      inpIconUrl.value = lic.icon_url || '';
      inpPrimaryColor.value = lic.primary_color || '#AB5332';
      inpPrimaryPicker.value = lic.primary_color || '#AB5332';
      inpSecondaryColor.value = lic.secondary_color || '#C5A465';
      inpSecondaryPicker.value = lic.secondary_color || '#C5A465';
      inpWhatsapp.value = lic.whatsapp_number || '';
      inpAttendant.value = lic.attendant_name || 'Carla';
      inpMonthlyFee.value = lic.monthly_fee !== undefined ? lic.monthly_fee : 97.00;
      inpValidUntil.value = lic.valid_until || '';
      inpStatus.value = lic.status || 'active';
    } else {
      modalTitle.textContent = 'Cadastrar Nova Loja Parceira';
      inpId.value = '';
      inpClientName.value = '';
      inpDomain.value = '';
      inpKey.value = '';
      inpSupabaseUrl.value = '';
      inpSupabaseAnon.value = '';
      inpLogoUrl.value = '';
      inpIconUrl.value = '';
      inpPrimaryColor.value = '#AB5332';
      inpPrimaryPicker.value = '#AB5332';
      inpSecondaryColor.value = '#C5A465';
      inpSecondaryPicker.value = '#C5A465';
      inpWhatsapp.value = '';
      inpAttendant.value = 'Carla';
      inpMonthlyFee.value = '97.00';
      inpStatus.value = 'active';

      // Sugere validade inicial de 30 dias a partir de hoje
      const defaultExp = new Date();
      defaultExp.setDate(defaultExp.getDate() + 30);
      inpValidUntil.value = defaultExp.toISOString().split('T')[0];
    }

    // Exibe o modal garantindo classe active e estilos visíveis
    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.style.visibility = 'visible';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Foca suavemente no campo do nome
    setTimeout(() => inpClientName?.focus(), 80);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    modal.style.visibility = 'hidden';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  btnOpenCreate?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(null);
  });
  btnCloseModal?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
  btnCancelModal?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
  
  // Fechar ao clicar fora da janela
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Fechar com a tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      closeModal();
    }
  });

  searchInput?.addEventListener('input', () => renderTable(licensesData));

  // Salvar Loja (Insert ou Update)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-license');
    if (!btnSave) return;

    btnSave.disabled = true;
    btnSave.textContent = 'Gravando...';

    const payload = {
      client_name: inpClientName.value.trim(),
      domain: inpDomain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''),
      license_key: inpKey.value.trim().toUpperCase(),
      supabase_url: inpSupabaseUrl.value.trim(),
      supabase_anon_key: inpSupabaseAnon.value.trim(),
      logo_url: inpLogoUrl.value.trim() || null,
      icon_url: inpIconUrl.value.trim() || null,
      primary_color: inpPrimaryColor.value.trim().toUpperCase() || '#AB5332',
      secondary_color: inpSecondaryColor.value.trim().toUpperCase() || '#C5A465',
      whatsapp_number: inpWhatsapp.value.trim() || null,
      attendant_name: inpAttendant.value.trim() || 'Carla',
      monthly_fee: parseFloat(inpMonthlyFee.value) || 0,
      valid_until: inpValidUntil.value,
      status: inpStatus.value
    };

    try {
      if (!client) {
        throw new Error('Supabase Client não inicializado. Verifique se assets/js/supabase.js está carregado.');
      }

      const isEdit = Boolean(inpId.value);
      let resError = null;

      if (isEdit) {
        const { error } = await client.from('licenses').update(payload).eq('id', inpId.value);
        resError = error;
      } else {
        const { error } = await client.from('licenses').insert([payload]);
        resError = error;
      }

      if (resError) throw resError;

      alert(`Loja "${payload.client_name}" salva com sucesso! Os parâmetros já estão ativos.`);
      closeModal();
      await loadLicenses();
    } catch (err) {
      console.error('Erro ao salvar licença:', err);
      alert('Erro ao salvar loja: ' + (err.message || JSON.stringify(err)));
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Salvar Parâmetros da Loja';
    }
  });

  // Inicializa a listagem
  loadLicenses();
});
