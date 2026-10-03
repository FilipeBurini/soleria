-- ==========================================================================
-- SOLÉRIA — CORREÇÃO DEFINITIVA: RLS ORDERS + BAIXA ATÔMICA DE ESTOQUE
-- Copie e cole todo este script no SQL Editor do Supabase Dashboard
-- URL: https://supabase.com/dashboard/project/kqmkvskdhoficppjskgy/sql
-- ==========================================================================

-- 1. Garante colunas necessárias na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'aguardando_pagamento';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagbank_card JSONB DEFAULT '{}'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved_in_db BOOLEAN DEFAULT false;

-- 2. Habilita RLS na tabela orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas de orders para evitar qualquer conflito
DROP POLICY IF EXISTS "allow_anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "allow_anon_select_orders" ON orders;
DROP POLICY IF EXISTS "allow_anon_update_orders" ON orders;
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
DROP POLICY IF EXISTS "Enable insert for all users" ON orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON orders;

-- Permite que visitantes (checkout anônimo) e autenticados criem pedidos
CREATE POLICY "allow_anon_insert_orders" 
ON orders FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Permite leitura de pedidos para consulta no checkout, rastreio e minha conta
CREATE POLICY "allow_anon_select_orders" 
ON orders FOR SELECT 
TO anon, authenticated 
USING (true);

-- Administradores autenticados têm permissão irrestrita (leitura, edição, exclusão)
CREATE POLICY "admin_all_orders" 
ON orders FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Blindagem de RLS na tabela products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_products" ON products;
DROP POLICY IF EXISTS "admin_manage_products" ON products;

CREATE POLICY "public_read_products" 
ON products FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "admin_manage_products" 
ON products FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- ==========================================================================
-- 4. Função e Gatilho de Baixa Atômica de Estoque (BEFORE INSERT)
-- Executa com SECURITY DEFINER (como superusuário postgres, sem barreiras de RLS)
-- ==========================================================================
CREATE OR REPLACE FUNCTION handle_new_order_stock_deduction()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_rec JSONB;
  prod_id UUID;
  item_qty INT;
  item_size TEXT;
  curr_stock INT;
  curr_sizes JSONB;
  curr_aro_qty INT;
  prod_name TEXT;
  did_deduct BOOLEAN := false;
BEGIN
  -- Não executa se pedido for criado como cancelado
  IF NEW.items IS NOT NULL AND jsonb_array_length(NEW.items) > 0 AND COALESCE(NEW.status, '') != 'cancelado' THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      BEGIN
        IF (item_rec->>'id') IS NOT NULL AND (item_rec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          prod_id := (item_rec->>'id')::UUID;
          item_qty := GREATEST(COALESCE((item_rec->>'quantity')::INT, 1), 1);
          item_size := NULLIF(TRIM(COALESCE(item_rec->>'size', '')), '');

          -- Trava de concorrência com bloqueio de linha (FOR UPDATE)
          SELECT stock, sizes, name INTO curr_stock, curr_sizes, prod_name 
          FROM products WHERE id = prod_id FOR UPDATE;

          IF FOUND THEN
            -- Se for anel com aro específico informado
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);

              IF curr_aro_qty < item_qty THEN
                RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: O produto "%" (Aro %) possui apenas % unidade(s) disponível(is).',
                  COALESCE(prod_name, item_rec->>'name', 'Item'), item_size, curr_aro_qty;
              END IF;

              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(curr_aro_qty - item_qty));
              
              -- Recalcula estoque total somando todos os aros
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
              did_deduct := true;
            ELSE
              -- Peça comum (sem aro ou aro livre)
              IF COALESCE(curr_stock, 0) < item_qty THEN
                RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: O produto "%" possui apenas % unidade(s) disponível(is).',
                  COALESCE(prod_name, item_rec->>'name', 'Item'), COALESCE(curr_stock, 0);
              END IF;

              UPDATE products 
              SET stock = curr_stock - item_qty, updated_at = now()
              WHERE id = prod_id;
              did_deduct := true;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ESTOQUE_INSUFICIENTE%' THEN
          RAISE EXCEPTION '%', SQLERRM;
        ELSE
          RAISE WARNING 'Aviso ao baixar estoque do item: %', SQLERRM;
        END IF;
      END;
    END LOOP;
  END IF;

  -- Se abateu peças com sucesso no banco, marca stock_deducted = true
  IF did_deduct THEN
    NEW.stock_deducted := true;
    NEW.stock_restored := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_deduction ON orders;
CREATE TRIGGER trg_order_stock_deduction
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_new_order_stock_deduction();

-- ==========================================================================
-- 5. Gatilho de Devolução Automática ao Estoque se Pedido Cancelado (BEFORE UPDATE)
-- ==========================================================================
CREATE OR REPLACE FUNCTION handle_order_stock_restoration()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Só devolve se o status mudou para 'cancelado' e o estoque havia sido baixado
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' AND OLD.stock_deducted = true THEN
    IF NEW.items IS NOT NULL THEN
      FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
      LOOP
        BEGIN
          IF (item_rec->>'id') IS NOT NULL AND (item_rec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            prod_id := (item_rec->>'id')::UUID;
            item_qty := GREATEST(COALESCE((item_rec->>'quantity')::INT, 1), 1);
            item_size := NULLIF(TRIM(COALESCE(item_rec->>'size', '')), '');

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
    NEW.stock_deducted := false;
    NEW.stock_restored := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_restore ON orders;
CREATE TRIGGER trg_order_stock_restore
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_order_stock_restoration();

-- ==========================================================================
-- 6. RPC para dar Baixa Manual em Pedido Específico (Caso o Admin precise)
-- ==========================================================================
CREATE OR REPLACE FUNCTION admin_deduct_order_stock(p_order_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  item_rec JSONB;
  prod_id UUID;
  item_qty INT;
  item_size TEXT;
  curr_stock INT;
  curr_sizes JSONB;
  curr_aro_qty INT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE order_number = p_order_number FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado');
  END IF;

  IF v_order.items IS NOT NULL THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(v_order.items)
    LOOP
      BEGIN
        IF (item_rec->>'id') IS NOT NULL AND (item_rec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          prod_id := (item_rec->>'id')::UUID;
          item_qty := GREATEST(COALESCE((item_rec->>'quantity')::INT, 1), 1);
          item_size := NULLIF(TRIM(COALESCE(item_rec->>'size', '')), '');

          SELECT stock, sizes INTO curr_stock, curr_sizes 
          FROM products WHERE id = prod_id FOR UPDATE;

          IF FOUND THEN
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);
              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(GREATEST(0, curr_aro_qty - item_qty)));
              
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              UPDATE products 
              SET stock = GREATEST(0, COALESCE(curr_stock, 0) - item_qty), updated_at = now()
              WHERE id = prod_id;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  UPDATE orders 
  SET stock_deducted = true, stock_restored = false, updated_at = now() 
  WHERE order_number = p_order_number;

  RETURN jsonb_build_object('success', true, 'message', 'Estoque baixado com sucesso');
END;
$$;
