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

-- ==========================================================================
-- 4. Permissão para Baixa Imediata de Estoque pela Sacola (RLS em products)
-- ==========================================================================
DROP POLICY IF EXISTS "allow_anon_update_products_stock" ON products;
CREATE POLICY "allow_anon_update_products_stock" 
ON products FOR UPDATE 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- ==========================================================================
-- 5. Gatilho Automático PostgreSQL: Baixa de Estoque Imediata ao Criar Pedido
--    Executa com SECURITY DEFINER (nível de superusuário do banco)
-- ==========================================================================
CREATE OR REPLACE FUNCTION handle_new_order_stock_deduction()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_rec JSONB;
  prod_id UUID;
  item_qty INT;
  item_size TEXT;
  curr_stock INT;
  curr_sizes JSONB;
  curr_aro_qty INT;
BEGIN
  -- Só processa se o pedido tiver itens e não estiver cancelado
  IF NEW.items IS NOT NULL AND NEW.status != 'cancelado' THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      BEGIN
        prod_id := (item_rec->>'id')::UUID;
        item_qty := COALESCE((item_rec->>'quantity')::INT, 1);
        item_size := item_rec->>'size';

        IF prod_id IS NOT NULL THEN
          SELECT stock, sizes INTO curr_stock, curr_sizes 
          FROM products WHERE id = prod_id FOR UPDATE;

          IF FOUND THEN
            -- Se for anel com aro específico
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);
              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(GREATEST(0, curr_aro_qty - item_qty)));
              
              -- Recalcula estoque total somando aros
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              -- Peça única ou sem aro (colares, brincos, etc)
              UPDATE products 
              SET stock = GREATEST(0, COALESCE(curr_stock, 0) - item_qty), updated_at = now()
              WHERE id = prod_id;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Silencia falha em item individual para não travar inserção do pedido
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_deduction ON orders;
CREATE TRIGGER trg_order_stock_deduction
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_new_order_stock_deduction();

-- ==========================================================================
-- 6. Gatilho Automático: Devolução ao Estoque em caso de Cancelamento do Pedido
-- ==========================================================================
CREATE OR REPLACE FUNCTION handle_order_stock_restoration()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_rec JSONB;
  prod_id UUID;
  item_qty INT;
  item_size TEXT;
  curr_stock INT;
  curr_sizes JSONB;
  curr_aro_qty INT;
BEGIN
  -- Se o pedido foi alterado para 'cancelado' vindo de outro status
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' AND NEW.items IS NOT NULL THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      BEGIN
        prod_id := (item_rec->>'id')::UUID;
        item_qty := COALESCE((item_rec->>'quantity')::INT, 1);
        item_size := item_rec->>'size';

        IF prod_id IS NOT NULL THEN
          SELECT stock, sizes INTO curr_stock, curr_sizes 
          FROM products WHERE id = prod_id FOR UPDATE;

          IF FOUND THEN
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);
              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(curr_aro_qty + item_qty));
              
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              UPDATE products 
              SET stock = COALESCE(curr_stock, 0) + item_qty, updated_at = now()
              WHERE id = prod_id;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_restore ON orders;
CREATE TRIGGER trg_order_stock_restore
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_order_stock_restoration();

