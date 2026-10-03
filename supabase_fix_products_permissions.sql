-- ==========================================================================
-- SOLÉRIA — CORREÇÃO DEFINITIVA DE PERMISSÕES: PRODUTOS & INSUMOS (RLS)
-- Copie e cole todo este script no SQL Editor do Supabase Dashboard
-- URL: https://supabase.com/dashboard/project/kgmkvskdhoficppjskgy/sql
-- ==========================================================================

-- 1. Garante que todas as colunas necessárias existam na tabela products
ALTER TABLE IF EXISTS products 
    ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS product_cost NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';

-- Sincroniza cost_price com product_cost e stock_qty com stock caso haja divergência
UPDATE products SET 
    product_cost = COALESCE(product_cost, cost_price, 0),
    cost_price = COALESCE(cost_price, product_cost, 0),
    stock = COALESCE(stock, stock_qty, 0),
    stock_qty = COALESCE(stock_qty, stock, 0);

-- 2. Configura RLS na tabela products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_products" ON products;
DROP POLICY IF EXISTS "admin_manage_products" ON products;
DROP POLICY IF EXISTS "anon_select_active_products" ON products;
DROP POLICY IF EXISTS "admin_all_products" ON products;
DROP POLICY IF EXISTS "allow_all_manage_products" ON products;
DROP POLICY IF EXISTS "allow_anon_read_products" ON products;
DROP POLICY IF EXISTS "allow_anon_insert_products" ON products;
DROP POLICY IF EXISTS "allow_anon_update_products" ON products;
DROP POLICY IF EXISTS "allow_anon_delete_products" ON products;

-- Leitura irrestrita de produtos (catálogo público e painel admin)
CREATE POLICY "allow_anon_read_products" 
ON products FOR SELECT 
TO anon, authenticated 
USING (true);

-- Inserção de novos produtos pelo backoffice
CREATE POLICY "allow_anon_insert_products" 
ON products FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Atualização de produtos pelo backoffice
CREATE POLICY "allow_anon_update_products" 
ON products FOR UPDATE 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Exclusão de produtos pelo backoffice
CREATE POLICY "allow_anon_delete_products" 
ON products FOR DELETE 
TO anon, authenticated 
USING (true);

-- 3. Configura RLS na tabela supplies (Insumos)
CREATE TABLE IF NOT EXISTS supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL DEFAULT 'un',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_supplies" ON supplies;
DROP POLICY IF EXISTS "allow_all_supplies" ON supplies;

CREATE POLICY "allow_all_supplies" 
ON supplies FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Configura RLS na tabela product_supplies (Vínculo de Insumos com Produtos)
CREATE TABLE IF NOT EXISTS product_supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    supply_id UUID REFERENCES supplies(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE product_supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_product_supplies" ON product_supplies;
DROP POLICY IF EXISTS "allow_all_product_supplies" ON product_supplies;

CREATE POLICY "allow_all_product_supplies" 
ON product_supplies FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 5. Permissões de Armazenamento para o bucket 'Fotos Produtos'
-- Garante que uploads de imagens sejam permitidos
INSERT INTO storage.buckets (id, name, public)
VALUES ('Fotos Produtos', 'Fotos Produtos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "public_select_fotos_produtos" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_fotos_produtos" ON storage.objects;
DROP POLICY IF EXISTS "public_update_fotos_produtos" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_fotos_produtos" ON storage.objects;

CREATE POLICY "public_select_fotos_produtos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'Fotos Produtos');

CREATE POLICY "public_insert_fotos_produtos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'Fotos Produtos');

CREATE POLICY "public_update_fotos_produtos"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'Fotos Produtos')
WITH CHECK (bucket_id = 'Fotos Produtos');

CREATE POLICY "public_delete_fotos_produtos"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'Fotos Produtos');
