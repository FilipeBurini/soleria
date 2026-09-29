-- ==========================================================================
-- SOLÉRIA — HAUTE JOAILLERIE & ACCESSOIRES
-- Módulo de Pedidos e Rastreamento sem Cadastro
-- Execute este script no SQL Editor do seu Supabase Dashboard
-- ==========================================================================

-- 1. Criação da tabela de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'entrega', -- 'entrega' ou 'retirada'
  customer_address JSONB DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'recebido', -- 'recebido', 'confirmado', 'preparacao', 'enviado', 'entregue', 'cancelado'
  payment_method TEXT DEFAULT 'a_combinar',
  tracking_code TEXT,
  customer_notes TEXT,
  admin_notes TEXT,
  stock_deducted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 3. Habilita Segurança por Nível de Linha (RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem para evitar duplicidade
DROP POLICY IF EXISTS "allow_anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "allow_anon_select_orders" ON orders;
DROP POLICY IF EXISTS "admin_all_orders" ON orders;

-- Clientes públicos (anônimos) podem criar seus pedidos
CREATE POLICY "allow_anon_insert_orders" 
ON orders FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Clientes públicos podem consultar pedidos (para a tela de rastreamento por número)
CREATE POLICY "allow_anon_select_orders" 
ON orders FOR SELECT 
TO anon, authenticated 
USING (true);

-- Administradores autenticados têm controle total (atualizar status, código de rastreio, notas)
CREATE POLICY "admin_all_orders" 
ON orders FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);
