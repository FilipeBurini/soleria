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

    // 1. Verifica se já existe no Supabase
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data: existing } = await client
          .from('customers')
          .select('id, cpf')
          .eq('cpf', cleanNum)
          .maybeSingle();

        if (existing) {
          throw new Error('Este CPF já possui cadastro. Faça login ou recupere seu acesso.');
        }
      } catch (err) {
        if (err.message && err.message.includes('Este CPF')) throw err;
        console.warn('Aviso ao consultar clientes no Supabase:', err);
      }
    }

    // 2. Verifica duplicidade local
    const localList = getLocalCustomers();
    if (localList.some(c => cleanCPF(c.cpf) === cleanNum)) {
      throw new Error('Este CPF já está cadastrado neste dispositivo.');
    }

    const customerRecord = {
      cpf: cleanNum,
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim().toLowerCase(),
      password_hash: passHash,
      address: address || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 3. Salva no Supabase se disponível
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client
          .from('customers')
          .insert([customerRecord])
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Erro ao inserir cliente no Supabase, salvando localmente:', error);
        } else if (data) {
          customerRecord.id = data.id;
        }
      } catch (e) {
        console.warn('Falha na requisição ao Supabase:', e);
      }
    }

    // 4. Salva localmente
    saveLocalCustomer(customerRecord);

    // 5. Inicia sessão do cliente
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

    // 1. Tenta no Supabase
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { data, error } = await client
          .from('customers')
          .select('*')
          .eq('cpf', cleanNum)
          .maybeSingle();

        if (data && !error) {
          if (data.password_hash === passHash) {
            customer = data;
          } else {
            throw new Error('Senha incorreta para o CPF informado.');
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('Senha incorreta')) throw err;
        console.warn('Busca no Supabase falhou, buscando local:', err);
      }
    }

    // 2. Se não encontrou no Supabase, busca no LocalStorage
    if (!customer) {
      const localList = getLocalCustomers();
      const localFound = localList.find(c => cleanCPF(c.cpf) === cleanNum);
      if (localFound) {
        if (localFound.password_hash === passHash) {
          customer = localFound;
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
   * Salva sessão ativa no LocalStorage
   */
  function setCustomerSession(customer) {
    const safeData = {
      id: customer.id || null,
      cpf: cleanCPF(customer.cpf),
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || {},
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
    const updatedCustomer = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    const client = getDb();
    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        await client
          .from('customers')
          .update({
            name: updatedCustomer.name,
            phone: updatedCustomer.phone,
            email: updatedCustomer.email,
            address: updatedCustomer.address,
            updated_at: updatedCustomer.updated_at
          })
          .eq('cpf', cleanNum);
      } catch (e) {
        console.warn('Erro ao atualizar cliente no Supabase:', e);
      }
    }

    saveLocalCustomer(updatedCustomer);
    setCustomerSession(updatedCustomer);
    return updatedCustomer;
  }

  /**
   * Busca todos os pedidos associados a este CPF
   */
  async function getCustomerOrders(cpf) {
    const cleanNum = cleanCPF(cpf);
    if (!cleanNum) return [];

    let orders = [];
    const client = getDb();

    if (client && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        // Tenta buscar por customer_cpf ou por telefone
        const currentCust = getCurrentCustomer();
        const phoneDigits = currentCust ? (currentCust.phone || '').replace(/\D/g, '') : '';

        let query = client
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (phoneDigits && phoneDigits.length >= 8) {
          query = query.or(`customer_cpf.eq.${cleanNum},customer_phone.ilike.*${phoneDigits.slice(-8)}*`);
        } else {
          query = query.eq('customer_cpf', cleanNum);
        }

        const { data, error } = await query;
        if (!error && data) {
          orders = data;
        }
      } catch (err) {
        console.warn('Erro ao buscar pedidos no Supabase:', err);
      }
    }

    // Mescla com pedidos salvos localmente
    try {
      const local = JSON.parse(localStorage.getItem('soleria_local_orders') || '[]');
      const currentCust = getCurrentCustomer();
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

  // Exporta para escopo global window.SoleriaCustomer
  window.SoleriaCustomer = {
    cleanCPF,
    formatCPF,
    isValidCPF,
    cadastrar: cadastrarCliente,
    login: loginCliente,
    logout: logoutCliente,
    getCurrent: getCurrentCustomer,
    updateProfile: updateCustomerProfile,
    getOrders: getCustomerOrders,
    getPiecesSummary: getCustomerPiecesSummary,
    updateNav: updateNavAccountUI
  };
})();
