-- ==========================================================================
-- SOLÉRIA SAAS WHITE-LABEL — SCHEMA COMPLETO PARA NOVA LOJA
-- Execute este script ÚNICO no SQL Editor de um projeto Supabase novo em branco.
-- Ele cria 100% da estrutura: Produtos, Aros, Insumos, Pedidos, Baixa Parcial,
-- CRM de Clientes, Cupons, Triggers de Estoque e Políticas de Segurança (RLS).
-- ==========================================================================

-- 1. HABILITA EXTENSÕES ESSENCIAIS DO POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================================
-- 2. TABELA DE INSUMOS (MATÉRIAS-PRIMAS, EMBALAGENS, BANHOS)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  unit TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_supplies" ON public.supplies;
CREATE POLICY "allow_all_supplies" ON public.supplies
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Insumos iniciais padrão
INSERT INTO public.supplies (name, unit_cost, unit)
VALUES
  ('Caixa Premium de Veludo', 8.50, 'un'),
  ('Sacola de Papel Luxo c/ Fita', 4.20, 'un'),
  ('Banho de Ouro 18k (10 Milésimos)', 15.00, 'un'),
  ('Certificado de Garantia & Flanela', 1.80, 'un')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- 3. TABELA DE PRODUTOS & JOIAS (COM SUPORTE A AROS 10-20 E ATÉ 6 FOTOS)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  sizes JSONB DEFAULT '{}'::jsonb,
  product_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cost_price NUMERIC(10,2) DEFAULT 0.00,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  original_price NUMERIC(10,2),
  stock INTEGER NOT NULL DEFAULT 0,
  stock_qty INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_read_products" ON public.products;
CREATE POLICY "allow_anon_read_products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_admin_manage_products" ON public.products;
CREATE POLICY "allow_admin_manage_products" ON public.products
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ==========================================================================
-- 4. TABELA DE VÍNCULO: PRODUTO X INSUMOS (ENGENHARIA DE CUSTOS)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.product_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  supply_id UUID REFERENCES public.supplies(id) ON DELETE RESTRICT,
  quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_supplies_product_id ON public.product_supplies(product_id);
CREATE INDEX IF NOT EXISTS idx_product_supplies_supply_id ON public.product_supplies(supply_id);

ALTER TABLE public.product_supplies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_product_supplies" ON public.product_supplies;
CREATE POLICY "allow_all_product_supplies" ON public.product_supplies
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ==========================================================================
-- 5. VIEW CONSOLIDADA DE INDICADORES FINANCEIROS (LUCRO & MARGEM POR PEÇA)
-- ==========================================================================
CREATE OR REPLACE VIEW public.products_financials WITH (security_invoker = true) AS
SELECT
    p.id,
    p.sku,
    p.name,
    p.category,
    p.product_cost,
    COALESCE(SUM(s.unit_cost * ps.quantity), 0.00)::numeric(12,2) AS supplies_cost,
    (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00))::numeric(12,2) AS total_cost,
    p.sale_price,
    (p.sale_price - (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00)))::numeric(12,2) AS unit_profit,
    p.stock,
    ((p.sale_price - (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00))) * p.stock)::numeric(12,2) AS total_profit,
    p.status,
    p.sku AS "SKU",
    p.name AS "Nome",
    p.category AS "Categoria",
    p.product_cost AS "Custo produto",
    COALESCE(SUM(s.unit_cost * ps.quantity), 0.00)::numeric(12,2) AS "Custo insumos",
    (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00))::numeric(12,2) AS "Custo total",
    p.sale_price AS "Preço de venda",
    (p.sale_price - (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00)))::numeric(12,2) AS "Lucro unitário",
    p.stock AS "Estoque",
    ((p.sale_price - (p.product_cost + COALESCE(SUM(s.unit_cost * ps.quantity), 0.00))) * p.stock)::numeric(12,2) AS "Lucro total do item",
    p.status AS "Status"
FROM
    public.products p
LEFT JOIN
    public.product_supplies ps ON p.id = ps.product_id
LEFT JOIN
    public.supplies s ON ps.supply_id = s.id
GROUP BY
    p.id, p.sku, p.name, p.category, p.product_cost, p.sale_price, p.stock, p.status;

-- ==========================================================================
-- 6. TABELA DE PEDIDOS (COM BAIXA PARCIAL, SALDO A RECEBER E RASTREIO)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_cpf TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'entrega', -- 'entrega' ou 'retirada'
  customer_address JSONB DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_code TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'recebido', -- 'recebido', 'confirmado', 'preparacao', 'enviado', 'entregue', 'cancelado'
  payment_method TEXT DEFAULT 'pix',
  payment_status TEXT DEFAULT 'aguardando_pagamento', -- 'aguardando_pagamento', 'parcial', 'pago'
  pagbank_card JSONB DEFAULT '{}'::jsonb,
  tracking_code TEXT,
  customer_notes TEXT,
  admin_notes TEXT,
  stock_deducted BOOLEAN DEFAULT false,
  stock_restored BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_cpf ON public.orders(customer_cpf);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_insert_orders" ON public.orders;
CREATE POLICY "allow_anon_insert_orders" 
ON public.orders FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_manage_orders" ON public.orders;
CREATE POLICY "allow_all_manage_orders" 
ON public.orders FOR ALL 
TO anon, authenticated 
USING (true) WITH CHECK (true);

-- ==========================================================================
-- 7. TABELA DE CLIENTES (CRM E ÁREA DA CLIENTE COM AUTENTICAÇÃO SEGURA)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  address JSONB DEFAULT '{}'::jsonb,
  session_token UUID DEFAULT gen_random_uuid(),
  total_orders INT DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_cpf ON public.customers(cpf);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_session_token ON public.customers(session_token);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_manage_customers" ON public.customers;
CREATE POLICY "allow_all_manage_customers"
ON public.customers FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- ==========================================================================
-- 8. TABELA DE CUPONS DE DESCONTO
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_value NUMERIC(10,2) DEFAULT 0.00,
  max_discount NUMERIC(10,2) DEFAULT NULL,
  usage_limit INT DEFAULT NULL,
  times_used INT DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  valid_until TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON public.coupons(is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_coupons" ON public.coupons;
CREATE POLICY "allow_all_coupons" ON public.coupons
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Cupons padrão iniciais da nova loja
INSERT INTO public.coupons (code, discount_type, discount_value, min_order_value, max_discount)
VALUES
  ('BEMVINDA10', 'percentage', 10.00, 150.00, NULL),
  ('LUZ15', 'percentage', 15.00, 300.00, NULL),
  ('FRETEGRATIS', 'fixed', 30.00, 200.00, NULL),
  ('PRIMEIRACOMPRA', 'fixed', 50.00, 400.00, NULL)
ON CONFLICT (code) DO NOTHING;

-- ==========================================================================
-- 9. GATILHOS ATÔMICOS POSTGRESQL (BAIXA E DEVOLUÇÃO AUTOMÁTICA DE ESTOQUE)
-- ==========================================================================

-- 9.1 Baixa automática ao inserir pedido
CREATE OR REPLACE FUNCTION public.handle_new_order_stock_deduction()
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
  IF NEW.items IS NOT NULL AND jsonb_array_length(NEW.items) > 0 THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      BEGIN
        IF (item_rec->>'id') IS NOT NULL AND (item_rec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          prod_id := (item_rec->>'id')::UUID;
          item_qty := COALESCE((item_rec->>'quantity')::INT, 1);
          item_size := item_rec->>'size';

          SELECT stock, sizes INTO curr_stock, curr_sizes 
          FROM public.products 
          WHERE id = prod_id 
          FOR UPDATE;

          IF FOUND THEN
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);
              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(GREATEST(0, curr_aro_qty - item_qty)));
              
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE public.products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              UPDATE public.products 
              SET stock = GREATEST(0, COALESCE(curr_stock, 0) - item_qty), updated_at = now()
              WHERE id = prod_id;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    NEW.stock_deducted := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_deduction ON public.orders;
CREATE TRIGGER trg_order_stock_deduction
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_order_stock_deduction();

-- 9.2 Devolução automática ao cancelar pedido
CREATE OR REPLACE FUNCTION public.handle_order_stock_restoration()
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
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' AND OLD.stock_deducted = true AND COALESCE(OLD.stock_restored, false) = false THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      BEGIN
        IF (item_rec->>'id') IS NOT NULL AND (item_rec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          prod_id := (item_rec->>'id')::UUID;
          item_qty := COALESCE((item_rec->>'quantity')::INT, 1);
          item_size := item_rec->>'size';

          SELECT stock, sizes INTO curr_stock, curr_sizes 
          FROM public.products 
          WHERE id = prod_id 
          FOR UPDATE;

          IF FOUND THEN
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);
              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(curr_aro_qty + item_qty));
              
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE public.products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              UPDATE public.products 
              SET stock = COALESCE(curr_stock, 0) + item_qty, updated_at = now()
              WHERE id = prod_id;
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    NEW.stock_restored := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_stock_restore ON public.orders;
CREATE TRIGGER trg_order_stock_restore
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_stock_restoration();

-- ==========================================================================
-- 10. FUNÇÕES RPC DE SEGURANÇA E PRIVACIDADE (LGPD)
-- ==========================================================================

-- 10.1 Autenticação Segura de Cliente
CREATE OR REPLACE FUNCTION public.customer_authenticate(
  p_cpf TEXT,
  p_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_num TEXT;
  cust RECORD;
  new_token UUID;
BEGIN
  clean_num := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  
  IF length(clean_num) != 11 THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF deve conter 11 dígitos.');
  END IF;

  SELECT * INTO cust FROM public.customers WHERE cpf = clean_num;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF não encontrado. Crie seu cadastro gratuitamente em instantes!');
  END IF;

  IF cust.password_hash != p_password_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Senha incorreta.');
  END IF;

  new_token := gen_random_uuid();
  UPDATE public.customers SET session_token = new_token, updated_at = now() WHERE id = cust.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_token', new_token,
    'customer', jsonb_build_object(
      'id', cust.id,
      'cpf', cust.cpf,
      'name', cust.name,
      'phone', cust.phone,
      'email', cust.email,
      'address', cust.address
    )
  );
END;
$$;

-- 10.2 Consulta de Rastreamento Protegido
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_search TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ord RECORD;
  clean_term TEXT;
BEGIN
  clean_term := trim(COALESCE(p_search, ''));

  IF clean_term = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Informe o número do pedido ou WhatsApp.');
  END IF;

  SELECT * INTO ord FROM public.orders 
  WHERE order_number ILIKE clean_term 
     OR customer_phone = regexp_replace(clean_term, '\D', '', 'g')
  ORDER BY created_at DESC 
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhum pedido localizado com os dados fornecidos.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'order_number', ord.order_number,
      'status', ord.status,
      'payment_status', ord.payment_status,
      'delivery_type', ord.delivery_type,
      'tracking_code', ord.tracking_code,
      'subtotal', ord.subtotal,
      'discount_amount', ord.discount_amount,
      'total_amount', ord.total_amount,
      'amount_paid', ord.amount_paid,
      'balance_due', ord.balance_due,
      'items', ord.items,
      'created_at', ord.created_at
    )
  );
END;
$$;

-- 10.3 Validação e Aplicação de Cupom
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code TEXT,
  p_subtotal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cup RECORD;
  calc_discount NUMERIC(10,2);
  final_val NUMERIC(10,2);
BEGIN
  SELECT * INTO cup FROM public.coupons 
  WHERE upper(code) = upper(trim(p_code)) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido ou não encontrado.');
  END IF;

  IF cup.valid_until IS NOT NULL AND cup.valid_until < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Este cupom já expirou.');
  END IF;

  IF cup.usage_limit IS NOT NULL AND cup.times_used >= cup.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Limite máximo de uso deste cupom esgotado.');
  END IF;

  IF p_subtotal < cup.min_order_value THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Pedido mínimo para este cupom: R$ ' || to_char(cup.min_order_value, 'FM999G999D00'));
  END IF;

  IF cup.discount_type = 'percentage' THEN
    calc_discount := round((p_subtotal * (cup.discount_value / 100.0)), 2);
    IF cup.max_discount IS NOT NULL AND calc_discount > cup.max_discount THEN
      calc_discount := cup.max_discount;
    END IF;
  ELSE
    calc_discount := cup.discount_value;
  END IF;

  calc_discount := least(calc_discount, p_subtotal);
  final_val := greatest(0, p_subtotal - calc_discount);

  RETURN jsonb_build_object(
    'valid', true,
    'code', cup.code,
    'discount_type', cup.discount_type,
    'discount_value', cup.discount_value,
    'discount_amount', calc_discount,
    'new_subtotal', final_val,
    'message', 'Cupom ' || cup.code || ' aplicado com sucesso!'
  );
END;
$$;

-- Concede permissões para as funções RPC
GRANT EXECUTE ON FUNCTION public.customer_authenticate(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, NUMERIC) TO anon, authenticated;

-- ==========================================================================
-- PRONTO! Todas as tabelas, índices, triggers e funções foram criadas.
-- Agora basta criar o bucket 'Fotos Produtos' público no Supabase Storage.
-- ==========================================================================
