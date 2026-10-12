-- ==========================================================================
-- SOLÉRIA SAAS MASTER — TABELA CENTRAL DE LOJAS & LICENÇAS WHITE-LABEL
-- Execute este script no SQL Editor do SEU PRÓPRIO Supabase Master.
-- Ele armazena as chaves de acesso, bancos dedicados, cores, logos e WhatsApp
-- de cada empresa parceira que contratou o seu sistema.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,                                  -- Ex: 'Joias da Ana'
  license_key TEXT UNIQUE NOT NULL,                          -- Ex: 'SLR-ANA-2026'
  domain TEXT NOT NULL,                                      -- Ex: 'joiasdaana.com.br' (ou 'joiasdaana.pages.dev')
  
  -- Banco de Dados Exclusivo da Cliente (Supabase Dedicado dela)
  supabase_url TEXT NOT NULL,                                -- Ex: 'https://xyzabcdefg.supabase.co'
  supabase_anon_key TEXT NOT NULL,                           -- Chave pública anon do Supabase dela
  
  -- Identidade Visual Dinâmica da Loja
  logo_url TEXT,                                             -- Link da imagem da logo horizontal
  icon_url TEXT,                                             -- Link do ícone / símbolo / favicon
  primary_color TEXT DEFAULT '#AB5332',                      -- Cor primária (ex: Terracota, Azul, Verde)
  secondary_color TEXT DEFAULT '#C5A465',                    -- Cor secundária / Dourada
  
  -- Atendimento & WhatsApp da Loja
  whatsapp_number TEXT,                                      -- Ex: '5511999999999'
  attendant_name TEXT DEFAULT 'Carla',                       -- Nome da atendente (ex: 'Ana', 'Mariana')
  
  -- Controle de Mensalidade & Faturamento
  monthly_fee NUMERIC(10, 2) DEFAULT 97.00,
  valid_until DATE NOT NULL,                                 -- Data de expiração da mensalidade
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de busca rápida por chave e por domínio
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_domain ON public.licenses(domain);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

-- Habilitar RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Política de Leitura Pública: Os sites das lojas parceiras e o Master podem consultar licenças
DROP POLICY IF EXISTS "Public can verify active license" ON public.licenses;
CREATE POLICY "Public can verify active license" ON public.licenses
  FOR SELECT TO anon, authenticated
  USING (true);

-- Política de Gerenciamento do Master: Permite inserir, atualizar e gerenciar licenças
DROP POLICY IF EXISTS "Master admin full control licenses" ON public.licenses;
CREATE POLICY "Master admin full control licenses" ON public.licenses
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger de atualização automática de updated_at
CREATE OR REPLACE FUNCTION update_licenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_licenses_updated_at ON public.licenses;
CREATE TRIGGER trg_licenses_updated_at
BEFORE UPDATE ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION update_licenses_updated_at();

-- ==========================================================================
-- Exemplo de inserção de uma loja teste para homologação:
-- ==========================================================================
INSERT INTO public.licenses (
  client_name, license_key, domain, 
  supabase_url, supabase_anon_key, 
  logo_url, icon_url, 
  primary_color, secondary_color, 
  whatsapp_number, attendant_name, 
  valid_until, status
)
VALUES (
  'Joias da Ana', 'SLR-ANA-2026', 'joiasdaana.com.br',
  'https://exemplo-ana.supabase.co', 'eyJhbGciOiJIUzI1Ni...',
  'https://exemplo.com/logo-ana.png', 'https://exemplo.com/icone-ana.png',
  '#B87333', '#D4AF37',
  '5511999998888', 'Ana',
  (CURRENT_DATE + INTERVAL '30 days'), 'active'
)
ON CONFLICT (license_key) DO NOTHING;
