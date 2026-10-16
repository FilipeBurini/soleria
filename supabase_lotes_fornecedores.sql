-- ==========================================================================
-- SOLÉRIA SAAS WHITE-LABEL — MÓDULO DE FORNECEDORES & LOTES DE COMPRA
-- Execute este script no SQL Editor do seu projeto Supabase.
-- Ele cria a estrutura completa de Fornecedores, Lotes de Compra e Itens,
-- adicionando compatibilidade retroativa nas tabelas de Produtos e Insumos.
-- ==========================================================================

-- 1. TABELA DE FORNECEDORES (PARCEIROS, OURIVESARIAS, EMBALAGENS, ETC.)
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trade_name TEXT,
  document TEXT,
  phone TEXT,
  email TEXT,
  category TEXT DEFAULT 'Geral', -- 'Joias & Ouro', 'Banhos & Galvanoplastia', 'Embalagens & Estojos', 'Pedras & Gemas', 'Geral'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON public.vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON public.vendors(category);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_vendors" ON public.vendors;
CREATE POLICY "allow_all_vendors" ON public.vendors
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 2. TABELA DE LOTES DE COMPRA / ENTRADAS DE MERCADORIA
CREATE TABLE IF NOT EXISTS public.purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT UNIQUE NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'pendente', 'em_transito', 'concluido')),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_batches_code ON public.purchase_batches(batch_code);
CREATE INDEX IF NOT EXISTS idx_purchase_batches_vendor ON public.purchase_batches(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_batches_date ON public.purchase_batches(purchase_date);

ALTER TABLE public.purchase_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_purchase_batches" ON public.purchase_batches;
CREATE POLICY "allow_all_purchase_batches" ON public.purchase_batches
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 3. TABELA DE ITENS DO LOTE (DETALHAMENTO DE PRODUTOS OU INSUMOS NO LOTE)
CREATE TABLE IF NOT EXISTS public.batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('produto', 'insumo')),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  supply_id UUID REFERENCES public.supplies(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id ON public.batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_product_id ON public.batch_items(product_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_supply_id ON public.batch_items(supply_id);

ALTER TABLE public.batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_batch_items" ON public.batch_items;
CREATE POLICY "allow_all_batch_items" ON public.batch_items
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 4. ADICIONA COLUNAS OPCIONAIS NAS TABELAS EXISTENTES (NON-BREAKING)
-- Produtos
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.purchase_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_batch_id ON public.products(batch_id);

-- Insumos (Matérias-Primas)
ALTER TABLE public.supplies 
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE public.supplies 
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.purchase_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplies_vendor_id ON public.supplies(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplies_batch_id ON public.supplies(batch_id);

-- 5. FORNECEDORES INICIAIS SUGERIDOS (OPCIONAIS)
INSERT INTO public.vendors (name, trade_name, category, phone, notes)
VALUES
  ('Ourivesaria Nobre Joias Ltda', 'Nobre Joias', 'Joias & Ouro', '(11) 98765-4321', 'Fornecedor principal de estruturas em prata e ouro.'),
  ('GalvanoLux Galvanoplastia & Banhos', 'GalvanoLux', 'Banhos & Galvanoplastia', '(11) 99123-4567', 'Banho de ouro 18k 10 milésimos e ródio.'),
  ('Embalagens Imperial Veludos', 'Imperial Veludo', 'Embalagens & Estojos', '(11) 97654-3210', 'Caixas premium, estojos e sacolas com fita de gorgurão.')
ON CONFLICT DO NOTHING;
