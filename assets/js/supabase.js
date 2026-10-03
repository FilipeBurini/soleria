/**
 * SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
 * Supabase Client Initialization & Shared Helper Functions
 * 
 * INSTRUÇÕES:
 * 1. Cole abaixo a URL do seu projeto Supabase e a anon public key.
 * 2. As permissões de acesso são protegidas pelas Políticas RLS no banco de dados.
 */

const SUPABASE_URL = 'https://kgmkvskdhoficppjskgy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P-XdBQaYxckZYoussxYHFA_ZW_ZSgmq';

// Inicialização do cliente Supabase via CDN global (@supabase/supabase-js@2)
let db = null;

function getSupabaseClient() {
  if (db) {
    if (typeof window !== 'undefined') window.db = db;
    return db;
  }
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function' && isSupabaseConfigured()) {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (typeof window !== 'undefined') window.db = db;
      return db;
    }
  } catch (e) {
    console.error('Erro ao inicializar Supabase:', e);
  }
  return db;
}

try {
  const _client = getSupabaseClient();
  if (_client && typeof window !== 'undefined') window.db = _client;
} catch (err) {
  console.error('Erro ao inicializar Supabase:', err);
}

/**
 * Verifica se o usuário já preencheu a URL e chave do Supabase
 */
function isSupabaseConfigured() {
  return SUPABASE_URL && 
         SUPABASE_ANON_KEY && 
         !SUPABASE_URL.includes('SUA-URL-AQUI') && 
         !SUPABASE_ANON_KEY.includes('SUA-ANON-KEY-AQUI');
}

/**
 * Notificação visual flutuante (Toast)
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : '')}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Formata valores numéricos para a moeda Real Brasileiro (BRL)
 */
function formatBRL(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Retorna o usuário autenticado atualmente, ou null se não houver sessão ativa
 */
async function getCurrentUser() {
  const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db);
  if (!client || !isSupabaseConfigured()) return null;
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    return session.user;
  } catch (e) {
    console.error('Erro ao verificar sessão:', e);
    return null;
  }
}

/**
 * Guarda de rota para páginas restritas do Admin.
 * Se o usuário não estiver autenticado, redireciona para admin.html
 */
async function requireAuth() {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase não configurado. Redirecionando para login admin.');
    if (!window.location.pathname.endsWith('admin.html')) {
      window.location.href = 'admin.html';
    }
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    if (!window.location.pathname.endsWith('admin.html')) {
      window.location.href = 'admin.html';
    }
    return null;
  }
  return user;
}

/**
 * Realiza logout do usuário e redireciona para tela de login
 */
async function logoutAdmin() {
  if (db) {
    try {
      await db.auth.signOut();
    } catch (e) {
      console.error('Erro ao deslogar:', e);
    }
  }
  window.location.href = 'admin.html';
}

/**
 * Utilitário para gerar o prefixo do SKU baseado no nome da categoria
 * Exemplo: 'Anéis' -> 'ANL', 'Brincos' -> 'BRN', 'Colares' -> 'COL', 'Pulseiras' -> 'PUL'
 */
function generateCategoryPrefix(categoryName) {
  if (!categoryName) return 'SLR';
  
  // Mapeamentos comuns para joalheria
  const map = {
    'anel': 'ANL',
    'aneis': 'ANL',
    'anéis': 'ANL',
    'brinco': 'BRN',
    'brincos': 'BRN',
    'colar': 'COL',
    'colares': 'COL',
    'pulseira': 'PUL',
    'pulseiras': 'PUL',
    'gargantilha': 'GAR',
    'gargantilhas': 'GAR',
    'pingente': 'PNG',
    'pingentes': 'PNG',
    'conjunto': 'CNJ',
    'conjuntos': 'CNJ',
    'bracelete': 'BRC',
    'braceletes': 'BRC',
    'piercing': 'PRC',
    'piercings': 'PRC',
    'tornozeleira': 'TRN',
    'tornozeleiras': 'TRN',
    'relogio': 'REL',
    'relógio': 'REL'
  };

  const clean = categoryName.toLowerCase().trim();
  if (map[clean]) return map[clean];

  // Regra geral: 3 primeiras consoantes/letras sem acentos
  const normalized = categoryName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return (normalized.length >= 3 ? normalized.substring(0, 3) : normalized.padEnd(3, 'X'));
}

/**
 * Upload de imagem para o bucket do Supabase Storage ('Fotos Produtos')
 * Organiza os arquivos em subpastas pelo SKU do produto (ex: Fotos Produtos/AN5032/foto.jpg)
 */
async function uploadImageToStorage(file, folderName = '', bucket = 'Fotos Produtos') {
  const client = (typeof getSupabaseClient === 'function' ? getSupabaseClient() : db) || (typeof window !== 'undefined' ? window.db : null);
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase não configurado para upload de arquivos.');
  }

  // Sanitiza o nome da pasta (usando o SKU, sem caracteres especiais que quebrem URLs)
  let cleanFolder = (folderName || 'geral')
    .trim()
    .replace(/[\\/:\*\?"<>\|]/g, '-')
    .replace(/\s+/g, '-');

  // Gera nome único para o arquivo
  const fileExt = file.name.split('.').pop().toLowerCase();
  const fileBaseName = file.name.substring(0, file.name.lastIndexOf('.')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${Date.now()}_${fileBaseName}.${fileExt}`;
  
  // Caminho final dentro do bucket: SKU/arquivo.ext
  const filePath = `${cleanFolder}/${fileName}`;

  const { data, error } = await client.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    throw error;
  }

  // Obtém a URL pública do arquivo
  const { data: publicData } = client.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return publicData.publicUrl;
}

// Banner discreto caso as credenciais ainda não tenham sido configuradas
document.addEventListener('DOMContentLoaded', () => {
  if (!isSupabaseConfigured()) {
    const notice = document.createElement('div');
    notice.style.cssText = `
      background-color: #FFF9ED;
      color: #92580C;
      font-size: 0.78rem;
      padding: 0.6rem 1rem;
      text-align: center;
      border-bottom: 1px solid #FFE7B3;
      position: sticky;
      top: 0;
      z-index: 99999;
      font-family: var(--font-sans);
    `;
    notice.innerHTML = `
      <strong>Atenção:</strong> Supabase ainda não configurado. Edite o arquivo <code>assets/js/supabase.js</code> e insira sua <em>SUPABASE_URL</em> e <em>SUPABASE_ANON_KEY</em>.
    `;
    document.body.prepend(notice);
  }
});
