/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Gestão de Insumos: Listagem, cadastro, edição e exclusão de matérias-primas
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Guarda de rota autenticada
  const currentUser = await requireAuth();
  if (!currentUser) return;

  const adminEmailElem = document.getElementById('admin-user-email');
  if (adminEmailElem) adminEmailElem.textContent = currentUser.email || 'Operador Autenticado';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => logoutAdmin());

  // Elementos do DOM
  const formCard = document.getElementById('supply-form-card');
  const formTitle = document.getElementById('form-supply-title');
  const form = document.getElementById('supply-form');
  const editIdInput = document.getElementById('supply-edit-id');
  const nameInput = document.getElementById('supply-name');
  const costInput = document.getElementById('supply-cost');
  const unitInput = document.getElementById('supply-unit');
  const btnOpenNew = document.getElementById('btn-open-new-supply');
  const btnCancel = document.getElementById('btn-cancel-supply');
  const btnSave = document.getElementById('btn-save-supply');

  const suppliesTbody = document.getElementById('supplies-tbody');
  const suppliesLoading = document.getElementById('supplies-loading');
  const suppliesEmpty = document.getElementById('supplies-empty');
  const searchInput = document.getElementById('search-supplies-input');
  const suppliesCount = document.getElementById('supplies-count');

  let allSupplies = [];

  // ==========================================================================
  // Carregamento dos Insumos da Tabela supplies
  // ==========================================================================

  async function fetchSupplies() {
    suppliesLoading.style.display = 'block';
    suppliesEmpty.style.display = 'none';

    try {
      const { data, error } = await db
        .from('supplies')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erro ao listar insumos:', error);
        showToast('Erro ao carregar insumos: ' + error.message, 'error');
        allSupplies = [];
      } else {
        allSupplies = data || [];
      }
    } catch (err) {
      console.error('Falha de conexão com supplies:', err);
      showToast('Falha na comunicação com o banco de dados.', 'error');
    } finally {
      suppliesLoading.style.display = 'none';
      renderSuppliesTable();
    }
  }

  // ==========================================================================
  // Renderização da Tabela de Insumos
  // ==========================================================================

  function renderSuppliesTable() {
    const q = (searchInput ? searchInput.value.trim().toLowerCase() : '');

    const filtered = allSupplies.filter(item => {
      return !q || 
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.unit && item.unit.toLowerCase().includes(q));
    });

    if (suppliesCount) {
      suppliesCount.textContent = `${allSupplies.length} insumo(s) cadastrado(s)`;
    }

    suppliesTbody.innerHTML = '';

    if (filtered.length === 0) {
      suppliesEmpty.style.display = 'block';
      return;
    }

    suppliesEmpty.style.display = 'none';

    filtered.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 500;">${item.name}</td>
        <td style="text-align: right;" class="val-currency">${formatBRL(item.unit_cost)}</td>
        <td style="text-align: center;"><span style="font-family: monospace; background: var(--bg-surface-alt); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);">${item.unit || 'un'}</span></td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.4rem;">
            <button type="button" class="btn-secondary-action btn-edit-supply" data-id="${item.id}" style="padding: 0.3rem 0.6rem; font-size: 0.72rem;">
              Editar
            </button>
            <button type="button" class="btn-danger-outline btn-delete-supply" data-id="${item.id}" style="padding: 0.3rem 0.6rem; font-size: 0.72rem;">
              Excluir
            </button>
          </div>
        </td>
      `;
      suppliesTbody.appendChild(tr);
    });

    // Listeners de Ações
    suppliesTbody.querySelectorAll('.btn-edit-supply').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openEditSupply(id);
      });
    });

    suppliesTbody.querySelectorAll('.btn-delete-supply').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        deleteSupply(id);
      });
    });
  }

  // ==========================================================================
  // Formulário: Abrir Novo, Editar, Cancelar
  // ==========================================================================

  function openNewSupply() {
    formTitle.textContent = 'Novo Insumo';
    btnSave.textContent = 'Salvar Insumo';
    editIdInput.value = '';
    form.reset();
    formCard.style.display = 'block';
    nameInput.focus();
    formCard.scrollIntoView({ behavior: 'smooth' });
  }

  function openEditSupply(id) {
    const supply = allSupplies.find(s => s.id == id);
    if (!supply) return;

    formTitle.textContent = 'Editar Insumo';
    btnSave.textContent = 'Atualizar Insumo';
    editIdInput.value = supply.id;
    nameInput.value = supply.name || '';
    costInput.value = Number(supply.unit_cost || 0).toFixed(2);
    unitInput.value = supply.unit || 'un';

    formCard.style.display = 'block';
    nameInput.focus();
    formCard.scrollIntoView({ behavior: 'smooth' });
  }

  function closeForm() {
    formCard.style.display = 'none';
    form.reset();
    editIdInput.value = '';
  }

  btnOpenNew.addEventListener('click', openNewSupply);
  btnCancel.addEventListener('click', closeForm);

  // Busca em tempo real
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderSuppliesTable();
    });
  }

  // ==========================================================================
  // Salvar / Atualizar Insumo
  // ==========================================================================

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isSupabaseConfigured()) {
      showToast('Supabase não configurado.', 'error');
      return;
    }

    const editId = editIdInput.value;
    const isEdit = Boolean(editId);

    const payload = {
      name: nameInput.value.trim(),
      unit_cost: parseFloat(costInput.value) || 0,
      unit: unitInput.value.trim().toLowerCase()
    };

    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';

    try {
      if (isEdit) {
        const { error } = await db
          .from('supplies')
          .update(payload)
          .eq('id', editId);

        if (error) throw error;
        showToast('Insumo atualizado com sucesso!', 'success');
      } else {
        const { error } = await db
          .from('supplies')
          .insert([payload]);

        if (error) throw error;
        showToast('Insumo cadastrado com sucesso!', 'success');
      }

      closeForm();
      await fetchSupplies();

    } catch (err) {
      console.error('Erro ao salvar insumo:', err);
      showToast('Erro ao salvar insumo: ' + err.message, 'error', 5000);
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = isEdit ? 'Atualizar Insumo' : 'Salvar Insumo';
    }
  });

  // ==========================================================================
  // Exclusão de Insumo
  // ==========================================================================

  async function deleteSupply(id) {
    const supply = allSupplies.find(s => s.id == id);
    const supplyName = supply ? `"${supply.name}"` : 'este insumo';

    if (!confirm(`Deseja realmente excluir o insumo ${supplyName}? Se ele estiver vinculado a produtos, a view de custos poderá ser impactada.`)) {
      return;
    }

    try {
      const { error } = await db
        .from('supplies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showToast('Insumo excluído com sucesso.', 'info');
      await fetchSupplies();
    } catch (err) {
      console.error('Erro ao excluir insumo:', err);
      showToast('Não foi possível excluir o insumo: ' + err.message, 'error', 5000);
    }
  }

  // Inicialização
  fetchSupplies();
});
