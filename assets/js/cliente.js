/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Módulo de Autenticação e Gestão de Clientes (CPF + Senha)
 * Permite cadastro, login, histórico de pedidos e controle de peças solicitadas.
 */

(function () {
  'use strict';

  const CUSTOMER_SESSION_KEY = 'soleria_customer_session';
  const LOCAL_CUSTOMERS_KEY = 'soleria_local_customers';

  /**
   * Limpa CPF mantendo apenas dígitos
   */
  function cleanCPF(cpf) {
    return (cpf || '').toString().replace(/\D/g, '');
  }

  /**
   * Formata CPF (000.000.000-00)
   */
  function formatCPF(cpf) {
    const digits = cleanCPF(cpf);
    if (digits.length !== 11) return cpf || '';
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  /**
   * Formata telefone dinamicamente para 10 ou 11 dígitos
   * (00) 0000-0000 ou (00) 00000-0000
   */
  function formatPhone(phone) {
    let v = (phone || '').toString().replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 10) {
      return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    } else if (v.length > 6) {
      return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    } else if (v.length > 2) {
      return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    } else if (v.length > 0) {
      return `(${v}`;
    }
    return '';
  }

  /**
   * Validação básica do formato de CPF
   */
  function isValidCPF(cpf) {
    const digits = cleanCPF(cpf);
    if (digits.length !== 11) return false;
    // Rejeita sequências de dígitos iguais (ex: 111.111.111-11)
    if (/^(\d)\1{10}$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits.charAt(i), 10) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits.charAt(i), 10) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(digits.charAt(10), 10)) return false;

    return true;
  }

  /**
   * Gera hash SHA-256 para senhas com salt padrão do cliente
   */
  async function hashPassword(plainPassword) {
    if (!plainPassword) return '';
    try {
      const msgBuffer = new TextEncoder().encode(`soleria_salt_2026_${plainPassword}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback simples caso SubtleCrypto não esteja disponível (ex: HTTP local antigo)
      let hash = 0;
      const str = `soleria_salt_2026_${plainPassword}`;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return 'fb_' + Math.abs(hash).toString(16);
    }
  }

  /**
   * Obtém o cliente Supabase disponível
   */
  function getDb() {
    if (typeof getSupabaseClient === 'function') {
      const c = getSupabaseClient();
      if (c) return c;
    }
    if (typeof db !== 'undefined' && db) return db;
    if (window.supabase && typeof window.supabase.createClient === 'function' && typeof SUPABASE_URL !== 'undefined') {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return null;
  }

  /**
   * Retorna os clientes armazenados localmente
   */
  function getLocalCustomers() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CUSTOMERS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  /**
   * Salva cliente na lista local
   */
  function saveLocalCustomer(customer) {
    const list = getLocalCustomers();
    const idx = list.findIndex(c => cleanCPF(c.cpf) === cleanCPF(customer.cpf));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...customer, updated_at: new Date().toISOString() };
    } else {
      list.push({ ...customer, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(list));
  }

  /**
   * Cadastra novo cliente no banco de dados e localmente
   */
  async function cadastrarCliente({ name, cpf, phone, email, password, address }) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum || cleanNum.length !== 11) {
      throw new Error('Informe um CPF válido com 11 dígitos.');
    }
    if (!isValidCPF(cleanNum)) {
      throw new Error('O CPF digitado é inválido. Por favor, confira os números.');
    }
    if (!name || name.trim().length < 3) {
      throw new Error('Informe seu nome completo.');
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      throw new Error('Informe um número de WhatsApp ou celular válido com DDD.');
    }
    if (!password || password.length < 4) {
      throw new Error('A senha deve ter pelo menos 4 caracteres.');
    }

    const passHash = await hashPassword(password);
    const client = getDb();
    let customerRecord = null;

    // 1. Tenta cadastrar via RPC segura no Supabase (LGPD: sem expor hash no SELECT)
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.rpc('customer_register', {
          p_name: name.trim(),
          p_cpf: cleanNum,
          p_phone: phone.trim(),
          p_email: (email || '').trim().toLowerCase(),
          p_password_hash: passHash,
          p_address: address || {}
        });

        if (error) {
          console.warn('Erro ao chamar RPC customer_register no Supabase:', error);
        } else if (data) {
          if (!data.success) {
            // Se retornar que já possui cadastro (ex: pré-cadastro existente ou SQL antigo no Supabase),
            // tenta atualizar via RPC customer_sync_checkout com a nova senha escolhida
            if (data.message && (data.message.includes('já possui cadastro') || data.message.includes('já cadastrado'))) {
              try {
                const { data: syncData, error: syncErr } = await client.rpc('customer_sync_checkout', {
                  p_name: name.trim(),
                  p_cpf: cleanNum,
                  p_phone: phone.trim(),
                  p_email: (email || '').trim().toLowerCase(),
                  p_default_password_hash: passHash,
                  p_address: address || {}
                });
                if (!syncErr && syncData && syncData.success) {
                  customerRecord = {
                    ...syncData.customer,
                    session_token: syncData.session_token,
                    is_upgrade: true
                  };
                }
              } catch (syncErr) {
                console.warn('Tentativa de sincronizar pré-cadastro via sync_checkout:', syncErr);
              }
            }

            if (!customerRecord) {
              throw new Error(data.message || 'Erro ao realizar cadastro.');
            }
          } else {
            customerRecord = {
              ...data.customer,
              session_token: data.session_token,
              is_upgrade: !!data.is_upgrade
            };
          }
        }
      } catch (err) {
        if (err.message && (err.message.includes('Informe') || err.message.includes('CPF deve conter') || err.message.includes('senha'))) {
          throw err;
        }
        console.warn('Falha na requisição segura ao Supabase, tentando fallback local:', err);
      }
    }

    // 2. Fallback local se o Supabase não estiver configurado ou offline
    if (!customerRecord) {
      const localList = getLocalCustomers();
      const existing = localList.find(c => cleanCPF(c.cpf) === cleanNum);

      if (existing) {
        // Atualiza o pré-cadastro existente com a nova senha e dados completos
        customerRecord = {
          ...existing,
          name: name.trim(),
          phone: phone.trim(),
          email: (email || '').trim().toLowerCase(),
          password_hash: passHash,
          address: (address && address.street) ? address : (existing.address || {}),
          session_token: existing.session_token || ('loc_' + Math.random().toString(36).slice(2, 10)),
          updated_at: new Date().toISOString(),
          is_upgrade: true
        };
      } else {
        customerRecord = {
          id: 'loc_' + Math.random().toString(36).slice(2, 10),
          cpf: cleanNum,
          name: name.trim(),
          phone: phone.trim(),
          email: (email || '').trim().toLowerCase(),
          password_hash: passHash,
          address: address || {},
          session_token: 'loc_' + Math.random().toString(36).slice(2, 10),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }

      saveLocalCustomer(customerRecord);
    }

    // 3. Inicia sessão da cliente
    setCustomerSession(customerRecord);
    return customerRecord;
  }

  /**
   * Realiza login por CPF + Senha
   */
  async function loginCliente(cpf, password) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum || cleanNum.length !== 11) {
      throw new Error('Informe um CPF válido com 11 dígitos.');
    }
    if (!password) {
      throw new Error('Informe sua senha.');
    }

    const passHash = await hashPassword(password);
    const client = getDb();
    let customer = null;

    // 1. Tenta autenticação via RPC segura no Supabase (validação no banco sem vazar hashes)
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.rpc('customer_authenticate', {
          p_cpf: cleanNum,
          p_password_hash: passHash
        });

        if (error) {
          console.warn('Erro ao chamar RPC customer_authenticate:', error);
        } else if (data) {
          if (!data.success) {
            throw new Error(data.message || 'Credenciais inválidas.');
          }
          customer = {
            ...data.customer,
            session_token: data.session_token
          };
        }
      } catch (err) {
        if (err.message && (err.message.includes('Senha incorreta') || err.message.includes('CPF não encontrado'))) {
          throw err;
        }
        console.warn('Busca no Supabase falhou, buscando local:', err);
      }
    }

    // 2. Se não conectou via RPC, busca no LocalStorage (fallback local/offline)
    if (!customer) {
      const localList = getLocalCustomers();
      const localFound = localList.find(c => cleanCPF(c.cpf) === cleanNum);
      if (localFound) {
        if (localFound.password_hash === passHash) {
          customer = {
            ...localFound,
            session_token: localFound.session_token || ('loc_' + Math.random().toString(36).slice(2, 10))
          };
        } else {
          throw new Error('Senha incorreta para o CPF informado.');
        }
      }
    }

    if (!customer) {
      throw new Error('CPF não encontrado. Crie seu cadastro gratuitamente em instantes!');
    }

    setCustomerSession(customer);
    return customer;
  }

  /**
   * Salva sessão ativa no LocalStorage (sem expor hash de senha)
   */
  function setCustomerSession(customer) {
    const safeData = {
      id: customer.id || null,
      cpf: cleanCPF(customer.cpf),
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || {},
      session_token: customer.session_token || null,
      logged_at: new Date().toISOString()
    };
    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(safeData));
    updateNavAccountUI();
  }

  /**
   * Retorna cliente atualmente conectado ou null
   */
  function getCurrentCustomer() {
    try {
      const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Encerra a sessão do cliente
   */
  function logoutCliente() {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    updateNavAccountUI();
    if (window.location.pathname.endsWith('minha-conta.html')) {
      window.location.reload();
    }
  }

  /**
   * Atualiza endereço ou dados cadastrais do cliente
   */
  async function updateCustomerProfile(updates) {
    const current = getCurrentCustomer();
    if (!current) throw new Error('Cliente não autenticado.');

    const cleanNum = cleanCPF(current.cpf);
    const client = getDb();
    let updatedCustomer = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && current.session_token) {
      try {
        const { data, error } = await client.rpc('customer_update_profile', {
          p_cpf: cleanNum,
          p_session_token: current.session_token,
          p_name: updates.name || null,
          p_phone: updates.phone || null,
          p_email: updates.email || null,
          p_address: updates.address || null,
          p_new_password_hash: updates.new_password_hash || null
        });

        if (!error && data && data.success && data.customer) {
          updatedCustomer = {
            ...updatedCustomer,
            ...data.customer
          };
        }
      } catch (e) {
        console.warn('Erro ao atualizar cliente via RPC no Supabase:', e);
      }
    }

    saveLocalCustomer(updatedCustomer);
    setCustomerSession(updatedCustomer);
    return updatedCustomer;
  }

  /**
   * Busca todos os pedidos associados a este CPF autenticado
   */
  async function getCustomerOrders(cpf) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum) return [];

    let orders = [];
    const client = getDb();
    const currentCust = getCurrentCustomer();

    // 1. Busca autenticada via RPC no Supabase (LGPD: sem expor dados de terceiros)
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured() && currentCust && currentCust.session_token) {
      try {
        const { data, error } = await client.rpc('customer_get_orders', {
          p_cpf: cleanNum,
          p_session_token: currentCust.session_token
        });

        if (!error && data && data.success && Array.isArray(data.orders)) {
          orders = data.orders;
        }
      } catch (err) {
        console.warn('Erro ao buscar pedidos autenticados no Supabase:', err);
      }
    }

    // 2. Mescla com pedidos salvos localmente
    try {
      const local = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
      const phoneDigits = currentCust ? (currentCust.phone || '').replace(/\D/g, '') : '';

      local.forEach(o => {
        const oCpf = cleanCPF(o.customer_cpf);
        const oPhone = (o.customer_phone || '').replace(/\D/g, '');
        const matchCpf = oCpf && oCpf === cleanNum;
        const matchPhone = phoneDigits.length >= 8 && oPhone.includes(phoneDigits.slice(-8));

        if ((matchCpf || matchPhone) && !orders.some(x => x.order_number === o.order_number)) {
          orders.push(o);
        }
      });
    } catch (e) {}

    // Ordena mais recentes primeiro
    orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return orders;
  }

  /**
   * Consolida as peças solicitadas pelo cliente em todos os seus pedidos
   * Retorna: { totalPieces, piecesMap, list: [{ sku, name, size, quantity, ordersCount, lastOrderDate, lastPrice }] }
   */
  async function getCustomerPiecesSummary(cpf) {
    const orders = await getCustomerOrders(cpf);
    const piecesMap = {};
    let totalPieces = 0;

    orders.forEach(order => {
      // Ignora pedidos cancelados para contagem oficial de peças
      if (order.status === 'cancelado') return;

      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        const skuKey = (item.sku && item.sku !== 'N/A') ? item.sku : (item.name || 'item-geral');
        const key = `${skuKey}_${item.size || 'padrao'}`;
        const qty = Number(item.quantity) || 1;
        totalPieces += qty;

        if (!piecesMap[key]) {
          piecesMap[key] = {
            sku: item.sku || 'N/A',
            name: item.name,
            size: item.size || null,
            image: item.image || 'assets/images/logo-simbolo.png',
            totalQty: 0,
            ordersCount: 0,
            lastOrderNumber: order.order_number,
            lastOrderDate: order.created_at,
            lastPrice: Number(item.price) || 0
          };
        }

        piecesMap[key].totalQty += qty;
        piecesMap[key].ordersCount += 1;
      });
    });

    const list = Object.values(piecesMap).sort((a, b) => b.totalQty - a.totalQty);
    return {
      totalPieces,
      totalOrders: orders.filter(o => o.status !== 'cancelado').length,
      list
    };
  }

  /**
   * Atualiza a indicação do usuário na navbar
   */
  function updateNavAccountUI() {
    const accountLink = document.getElementById('nav-customer-account');
    if (!accountLink) return;

    const cust = getCurrentCustomer();
    if (cust && cust.name) {
      const firstName = cust.name.trim().split(' ')[0];
      accountLink.innerHTML = `👤 Olá, ${firstName}`;
      accountLink.title = `Minha Conta (${formatCPF(cust.cpf)})`;
    } else {
      accountLink.innerHTML = `👤 Minha Conta`;
      accountLink.title = `Entrar ou Cadastrar`;
    }
  }

  // Inicializa visual da navbar
  document.addEventListener('DOMContentLoaded', () => {
    updateNavAccountUI();
  });

  /**
   * Sincroniza ou cadastra automaticamente a cliente ao concluir um pedido no Checkout
   */
  async function syncCustomerFromCheckout({ name, cpf, phone, email = '', address = {} }) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum || cleanNum.length !== 11) return null;

    const defaultPassword = cleanNum.slice(0, 4);
    const passHash = await hashPassword(defaultPassword);
    const client = getDb();

    let customer = null;
    let isNew = false;

    // 1. Tenta sincronização segura via RPC no Supabase (upsert protegido)
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.rpc('customer_sync_checkout', {
          p_name: (name || '').trim(),
          p_cpf: cleanNum,
          p_phone: (phone || '').trim(),
          p_email: (email || '').trim().toLowerCase(),
          p_default_password_hash: passHash,
          p_address: (address && address.street) ? address : {}
        });

        if (!error && data && data.success && data.customer) {
          customer = {
            ...data.customer,
            session_token: data.session_token
          };
          isNew = !!data.is_new;
        }
      } catch (err) {
        console.warn('Aviso ao sincronizar cliente via RPC no Supabase:', err);
      }
    }

    // 2. Fallback no LocalStorage
    if (!customer) {
      const localList = getLocalCustomers();
      const existing = localList.find(c => cleanCPF(c.cpf) === cleanNum);

      if (existing) {
        isNew = false;
        customer = {
          ...existing,
          name: (name && name.trim().length >= 3) ? name.trim() : existing.name,
          phone: (phone && phone.replace(/\D/g, '').length >= 10) ? phone.trim() : existing.phone,
          email: (email && email.trim()) ? email.trim().toLowerCase() : (existing.email || ''),
          address: (address && address.street) ? address : (existing.address || {}),
          session_token: existing.session_token || ('loc_' + Math.random().toString(36).slice(2, 10)),
          updated_at: new Date().toISOString()
        };
      } else {
        isNew = true;
        customer = {
          id: 'loc_' + Math.random().toString(36).slice(2, 10),
          cpf: cleanNum,
          name: (name || 'Cliente Soléria').trim(),
          phone: (phone || '').trim(),
          email: (email || '').trim().toLowerCase(),
          password_hash: passHash,
          address: address || {},
          session_token: 'loc_' + Math.random().toString(36).slice(2, 10),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      saveLocalCustomer(customer);
    }

    setCustomerSession(customer);
    return { customer, isNew, initialPassword: isNew ? defaultPassword : null };
  }

  /**
   * Redefine senha da cliente mediante confirmação de CPF e telefone
   */
  async function recuperarSenhaCliente({ cpf, phone, newPassword }) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum || cleanNum.length !== 11) {
      throw new Error('Informe um CPF válido com 11 dígitos.');
    }
    const cleanPh = (phone || '').replace(/\D/g, '');
    if (cleanPh.length < 8) {
      throw new Error('Informe o telefone ou WhatsApp com DDD para confirmação.');
    }
    if (!newPassword || newPassword.length < 4) {
      throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
    }

    const passHash = await hashPassword(newPassword);
    const client = getDb();

    // 1. Tenta redefinir no Supabase via RPC segura
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client.rpc('customer_reset_password', {
          p_cpf: cleanNum,
          p_phone: cleanPh,
          p_new_password_hash: passHash
        });

        if (error) {
          console.warn('Erro ao chamar customer_reset_password:', error);
        } else if (data) {
          if (!data.success) {
            throw new Error(data.message || 'Não foi possível redefinir a senha.');
          }
          return { success: true, message: data.message };
        }
      } catch (err) {
        if (err.message && (err.message.includes('não confere') || err.message.includes('não encontrado') || err.message.includes('Informe'))) {
          throw err;
        }
        console.warn('Falha na redefinição via Supabase, tentando local:', err);
      }
    }

    // 2. Fallback no LocalStorage
    const localList = getLocalCustomers();
    const existingIdx = localList.findIndex(c => cleanCPF(c.cpf) === cleanNum);
    if (existingIdx !== -1) {
      const storedPh = (localList[existingIdx].phone || '').replace(/\D/g, '');
      if (storedPh.slice(-8) !== cleanPh.slice(-8)) {
        throw new Error('O telefone informado não confere com o cadastrado neste CPF.');
      }
      localList[existingIdx].password_hash = passHash;
      localList[existingIdx].updated_at = new Date().toISOString();
      localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(localList));
      return { success: true, message: 'Senha redefinida com sucesso!' };
    }

    throw new Error('CPF não localizado. Se você realizou compras recentes, sua senha inicial padrão são os 4 primeiros dígitos do CPF, ou solicite auxílio via WhatsApp.');
  }

  // Exporta para escopo global window.SoleriaCustomer
  window.SoleriaCustomer = {
    cleanCPF,
    formatCPF,
    formatPhone,
    isValidCPF,
    cadastrar: cadastrarCliente,
    login: loginCliente,
    logout: logoutCliente,
    recuperarSenha: recuperarSenhaCliente,
    getCurrent: getCurrentCustomer,
    updateProfile: updateCustomerProfile,
    getOrders: getCustomerOrders,
    getPiecesSummary: getCustomerPiecesSummary,
    syncFromCheckout: syncCustomerFromCheckout,
    updateNav: updateNavAccountUI
  };
})();
