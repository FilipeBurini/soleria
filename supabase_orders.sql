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
  payment_method TEXT DEFAULT 'pix',
  payment_status TEXT DEFAULT 'aguardando_pagamento',
  pagbank_card JSONB DEFAULT '{}'::jsonb,
  tracking_code TEXT,
  customer_notes TEXT,
  admin_notes TEXT,
  stock_deducted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migração para tabelas orders existentes que ainda não possuem as colunas do PagBank:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'aguardando_pagamento';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagbank_card JSONB DEFAULT '{}'::jsonb;

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

-- Clientes públicos (anônimos) podem criar seus pedidos no checkout
CREATE POLICY "allow_anon_insert_orders" 
ON orders FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Administradores autenticados têm controle total sobre pedidos
CREATE POLICY "admin_all_orders" 
ON orders FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- ==========================================================================
-- 4. Blindagem da Tabela products (Apenas Leitura Pública, Edição restrita a Admins)
-- ==========================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_update_products_stock" ON products;
DROP POLICY IF EXISTS "public_read_products" ON products;
CREATE POLICY "public_read_products" 
ON products FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "admin_manage_products" ON products;
CREATE POLICY "admin_manage_products" 
ON products FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

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
  prod_name TEXT;
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
          SELECT stock, sizes, name INTO curr_stock, curr_sizes, prod_name 
          FROM products WHERE id = prod_id FOR UPDATE;

          IF FOUND THEN
            -- Se for anel com aro específico
            IF item_size IS NOT NULL AND curr_sizes IS NOT NULL AND curr_sizes ? item_size THEN
              curr_aro_qty := COALESCE((curr_sizes->>item_size)::INT, 0);

              IF curr_aro_qty < item_qty THEN
                RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: O produto "%" (Aro %) possui apenas % unidade(s) disponível(is).',
                  COALESCE(prod_name, item_rec->>'name', 'Item'), item_size, curr_aro_qty;
              END IF;

              curr_sizes := jsonb_set(curr_sizes, ARRAY[item_size], to_jsonb(curr_aro_qty - item_qty));
              
              -- Recalcula estoque total somando aros
              SELECT COALESCE(SUM((val)::INT), 0) INTO curr_stock 
              FROM jsonb_each_text(curr_sizes) AS t(key, val);

              UPDATE products 
              SET sizes = curr_sizes, stock = curr_stock, updated_at = now()
              WHERE id = prod_id;
            ELSE
              -- Peça única ou sem aro (colares, brincos, etc)
              IF COALESCE(curr_stock, 0) < item_qty THEN
                RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE: O produto "%" possui apenas % unidade(s) disponível(is).',
                  COALESCE(prod_name, item_rec->>'name', 'Item'), COALESCE(curr_stock, 0);
              END IF;

              UPDATE products 
              SET stock = curr_stock - item_qty, updated_at = now()
              WHERE id = prod_id;
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

-- ==========================================================================
-- 7. Tabela de Clientes (Cadastro Simples CPF + Senha)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  address JSONB DEFAULT '{}'::jsonb,
  session_token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garante que a coluna session_token exista mesmo se a tabela já foi criada anteriormente
ALTER TABLE customers ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(cpf);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_session_token ON customers(session_token);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Remove política aberta antiga que expunha todos os dados dos clientes
DROP POLICY IF EXISTS "allow_anon_customers" ON customers;
DROP POLICY IF EXISTS "admin_all_customers" ON customers;

-- Apenas administradores autenticados podem gerenciar os clientes diretamente
CREATE POLICY "admin_all_customers"
ON customers FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Garante que a coluna customer_cpf exista na tabela orders antes de indexar
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_customer_cpf ON orders(customer_cpf);

-- ==========================================================================
-- 8. Funções Seguras RPC (SECURITY DEFINER) - Blindagem, Privacidade e LGPD
-- ==========================================================================

-- 8.1 Autenticação Segura de Cliente (Retorna dados protegidos e session_token sem vazar password_hash)
CREATE OR REPLACE FUNCTION customer_authenticate(
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

  SELECT * INTO cust FROM customers WHERE cpf = clean_num;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF não encontrado. Crie seu cadastro gratuitamente em instantes!');
  END IF;

  IF cust.password_hash <> p_password_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Senha incorreta para o CPF informado.');
  END IF;

  new_token := gen_random_uuid();
  UPDATE customers SET session_token = new_token, updated_at = now() WHERE id = cust.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_token', new_token,
    'customer', jsonb_build_object(
      'id', cust.id,
      'cpf', cust.cpf,
      'name', cust.name,
      'phone', cust.phone,
      'email', COALESCE(cust.email, ''),
      'address', COALESCE(cust.address, '{}'::jsonb),
      'created_at', cust.created_at
    )
  );
END;
$$;

-- 8.2 Cadastro Seguro de Novo Cliente
CREATE OR REPLACE FUNCTION customer_register(
  p_name TEXT,
  p_cpf TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_password_hash TEXT,
  p_address JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_num TEXT;
  new_token UUID;
  created_cust RECORD;
  existing RECORD;
BEGIN
  clean_num := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(clean_num) != 11 THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF deve conter 11 dígitos.');
  END IF;

  IF length(trim(COALESCE(p_name, ''))) < 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Informe seu nome completo.');
  END IF;

  SELECT * INTO existing FROM customers WHERE cpf = clean_num;

  new_token := gen_random_uuid();

  IF FOUND THEN
    -- Atualiza o pré-cadastro existente (gerado presencialmente no admin ou no checkout) com os dados e a senha escolhida pelo cliente
    UPDATE customers SET
      name = trim(p_name),
      phone = trim(COALESCE(p_phone, phone)),
      email = lower(trim(COALESCE(p_email, email))),
      password_hash = p_password_hash,
      address = CASE 
        WHEN p_address IS NOT NULL AND p_address != '{}'::jsonb THEN p_address 
        ELSE address 
      END,
      session_token = new_token,
      updated_at = now()
    WHERE id = existing.id
    RETURNING * INTO created_cust;

    RETURN jsonb_build_object(
      'success', true,
      'is_upgrade', true,
      'message', 'Seu pré-cadastro foi ativado e atualizado com sucesso!',
      'session_token', new_token,
      'customer', jsonb_build_object(
        'id', created_cust.id,
        'cpf', created_cust.cpf,
        'name', created_cust.name,
        'phone', created_cust.phone,
        'email', created_cust.email,
        'address', created_cust.address,
        'created_at', created_cust.created_at
      )
    );
  ELSE
    -- Novo cadastro direto
    INSERT INTO customers (cpf, name, phone, email, password_hash, address, session_token)
    VALUES (
      clean_num,
      trim(p_name),
      trim(COALESCE(p_phone, '')),
      lower(trim(COALESCE(p_email, ''))),
      p_password_hash,
      COALESCE(p_address, '{}'::jsonb),
      new_token
    )
    RETURNING * INTO created_cust;

    RETURN jsonb_build_object(
      'success', true,
      'is_upgrade', false,
      'session_token', new_token,
      'customer', jsonb_build_object(
        'id', created_cust.id,
        'cpf', created_cust.cpf,
        'name', created_cust.name,
        'phone', created_cust.phone,
        'email', created_cust.email,
        'address', created_cust.address,
        'created_at', created_cust.created_at
      )
    );
  END IF;
END;
$$;

-- 8.3 Sincronização Segura a partir do Checkout (Cria ou Atualiza)
CREATE OR REPLACE FUNCTION customer_sync_checkout(
  p_name TEXT,
  p_cpf TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_default_password_hash TEXT,
  p_address JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_num TEXT;
  existing RECORD;
  new_token UUID;
  res_cust RECORD;
  is_new_cust BOOLEAN := false;
BEGIN
  clean_num := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(clean_num) != 11 THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF inválido.');
  END IF;

  new_token := gen_random_uuid();
  SELECT * INTO existing FROM customers WHERE cpf = clean_num;

  IF FOUND THEN
    UPDATE customers SET
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
      email = COALESCE(NULLIF(lower(trim(p_email)), ''), email),
      address = CASE 
        WHEN p_address IS NOT NULL AND p_address != '{}'::jsonb THEN p_address 
        ELSE address 
      END,
      session_token = new_token,
      updated_at = now()
    WHERE id = existing.id
    RETURNING * INTO res_cust;
  ELSE
    is_new_cust := true;
    INSERT INTO customers (cpf, name, phone, email, password_hash, address, session_token)
    VALUES (
      clean_num,
      COALESCE(NULLIF(trim(p_name), ''), 'Cliente Soléria'),
      trim(COALESCE(p_phone, '')),
      lower(trim(COALESCE(p_email, ''))),
      p_default_password_hash,
      COALESCE(p_address, '{}'::jsonb),
      new_token
    )
    RETURNING * INTO res_cust;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_new', is_new_cust,
    'session_token', new_token,
    'customer', jsonb_build_object(
      'id', res_cust.id,
      'cpf', res_cust.cpf,
      'name', res_cust.name,
      'phone', res_cust.phone,
      'email', res_cust.email,
      'address', res_cust.address
    )
  );
END;
$$;

-- 8.4 Busca de Pedidos Autenticada por Sessão da Cliente
CREATE OR REPLACE FUNCTION customer_get_orders(
  p_cpf TEXT,
  p_session_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_num TEXT;
  cust RECORD;
  orders_arr JSONB;
  clean_phone TEXT;
BEGIN
  clean_num := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');

  SELECT * INTO cust FROM customers WHERE cpf = clean_num AND session_token = p_session_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sessão inválida ou expirada.', 'orders', '[]'::jsonb);
  END IF;

  clean_phone := regexp_replace(COALESCE(cust.phone, ''), '\D', '', 'g');

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO orders_arr
  FROM orders o
  WHERE o.customer_cpf = clean_num
     OR (length(clean_phone) >= 8 AND regexp_replace(o.customer_phone, '\D', '', 'g') LIKE '%' || right(clean_phone, 8));

  RETURN jsonb_build_object('success', true, 'orders', orders_arr);
END;
$$;

-- 8.5 Atualização Segura de Perfil do Cliente
CREATE OR REPLACE FUNCTION customer_update_profile(
  p_cpf TEXT,
  p_session_token UUID,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_address JSONB DEFAULT NULL,
  p_new_password_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_num TEXT;
  cust RECORD;
  updated_cust RECORD;
BEGIN
  clean_num := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');

  SELECT * INTO cust FROM customers WHERE cpf = clean_num AND session_token = p_session_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sessão inválida ou expirada.');
  END IF;

  UPDATE customers SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    email = COALESCE(NULLIF(lower(trim(p_email)), ''), email),
    address = COALESCE(p_address, address),
    password_hash = COALESCE(NULLIF(p_new_password_hash, ''), password_hash),
    updated_at = now()
  WHERE id = cust.id
  RETURNING * INTO updated_cust;

  RETURN jsonb_build_object(
    'success', true,
    'customer', jsonb_build_object(
      'id', updated_cust.id,
      'cpf', updated_cust.cpf,
      'name', updated_cust.name,
      'phone', updated_cust.phone,
      'email', updated_cust.email,
      'address', updated_cust.address
    )
  );
END;
$$;

-- 8.6 Consulta Segura de Rastreamento Público (Sem vazar dados sensíveis / LGPD)
CREATE OR REPLACE FUNCTION get_order_tracking(
  p_query TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_q TEXT;
  clean_digits TEXT;
  results JSONB;
BEGIN
  clean_q := upper(trim(COALESCE(p_query, '')));
  clean_digits := regexp_replace(clean_q, '\D', '', 'g');

  IF clean_q = '' THEN
    RETURN jsonb_build_object('success', false, 'orders', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'order_number', o.order_number,
        'status', o.status,
        'delivery_type', o.delivery_type,
        'tracking_code', o.tracking_code,
        'items', o.items,
        'subtotal', o.subtotal,
        'discount_amount', o.discount_amount,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'updated_at', o.updated_at,
        -- LGPD: Ofusca nome e telefone para proteger privacidade da cliente
        'customer_name', regexp_replace(o.customer_name, '(?<=\b\w{2})\w+', '***', 'g'),
        'customer_phone', CASE 
          WHEN length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 10 THEN
            '(' || substr(regexp_replace(o.customer_phone, '\D', '', 'g'), 1, 2) || ') *****-' || right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4)
          ELSE 'Protegido'
        END,
        -- Exibe apenas Cidade/Bairro no rastreio público, omitindo rua, número residencial e CPF
        'delivery_city', COALESCE(o.customer_address->>'city', ''),
        'delivery_neighborhood', COALESCE(o.customer_address->>'neighborhood', ''),
        'customer_address', jsonb_build_object(
          'city', COALESCE(o.customer_address->>'city', ''),
          'neighborhood', COALESCE(o.customer_address->>'neighborhood', ''),
          'street', 'Endereço protegido por privacidade',
          'number', '***'
        ),
        'customer_notes', o.customer_notes
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO results
  FROM orders o
  WHERE (clean_q != '' AND (o.order_number ILIKE '%' || clean_q || '%' OR o.tracking_code ILIKE '%' || clean_q || '%'))
     OR (length(clean_digits) >= 8 AND regexp_replace(o.customer_phone, '\D', '', 'g') LIKE '%' || right(clean_digits, 8));

  RETURN jsonb_build_object('success', true, 'orders', results);
END;
$$;

-- 8.7 Redefinição Segura de Senha (mediante validação de CPF e Telefone cadastrado)
CREATE OR REPLACE FUNCTION customer_reset_password(
  p_cpf TEXT,
  p_phone TEXT,
  p_new_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_cpf TEXT;
  clean_phone TEXT;
  cust RECORD;
  new_token UUID;
BEGIN
  clean_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');

  IF length(clean_cpf) != 11 THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF deve conter 11 dígitos.');
  END IF;

  IF length(clean_phone) < 8 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Informe o WhatsApp ou telefone cadastrado para confirmação de identidade.');
  END IF;

  SELECT * INTO cust FROM customers WHERE cpf = clean_cpf;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'CPF não encontrado. Se você é novo cliente, sua senha padrão são os 4 primeiros dígitos do CPF.');
  END IF;

  -- Valida se os últimos 8 dígitos do telefone conferem com o cadastro
  IF right(regexp_replace(COALESCE(cust.phone, ''), '\D', '', 'g'), 8) <> right(clean_phone, 8) THEN
    RETURN jsonb_build_object('success', false, 'message', 'O telefone informado não confere com o cadastrado neste CPF. Solicite suporte via WhatsApp.');
  END IF;

  new_token := gen_random_uuid();
  UPDATE customers 
  SET password_hash = p_new_password_hash, session_token = new_token, updated_at = now()
  WHERE id = cust.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Senha redefinida com sucesso! Você já pode acessar sua conta com a nova senha.',
    'session_token', new_token
  );
END;
$$;

-- Permissões de Execução nas Funções RPC para uso anônimo e autenticado
GRANT EXECUTE ON FUNCTION customer_authenticate(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_register(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_sync_checkout(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_get_orders(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_update_profile(TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_tracking(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_reset_password(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ==========================================================================
-- FASE 5: SISTEMA DE CUPONS DE DESCONTO & CAMPOS DE PEDIDO
-- ==========================================================================

-- Garante coluna discount_code na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code TEXT;

-- Tabela de Cupons de Desconto
CREATE TABLE IF NOT EXISTS coupons (
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

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active coupons" ON coupons;
CREATE POLICY "Public can view active coupons" ON coupons
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin full control coupons" ON coupons;
CREATE POLICY "Admin full control coupons" ON coupons
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Cupons padrão iniciais da marca
INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_discount)
VALUES
  ('BEMVINDA10', 'percentage', 10.00, 150.00, NULL),
  ('LUZ15', 'percentage', 15.00, 300.00, NULL),
  ('FRETEGRATIS', 'fixed', 30.00, 200.00, NULL),
  ('SOLERIA50', 'fixed', 50.00, 500.00, NULL)
ON CONFLICT (code) DO NOTHING;

-- Função RPC para validação e cálculo atômico de cupom
CREATE OR REPLACE FUNCTION validate_coupon(
  p_code TEXT,
  p_subtotal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_coupon RECORD;
  v_discount NUMERIC(10,2) := 0.00;
  v_final_total NUMERIC(10,2) := 0.00;
BEGIN
  v_code := upper(trim(COALESCE(p_code, '')));

  IF v_code = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Informe um código de cupom.');
  END IF;

  SELECT * INTO v_coupon 
  FROM coupons 
  WHERE upper(code) = v_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido ou não encontrado.');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Este cupom não está mais ativo.');
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND now() < v_coupon.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Este cupom ainda não é válido.');
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND now() > v_coupon.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Este cupom expirou.');
  END IF;

  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.times_used >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'message', 'O limite de utilizações deste cupom foi atingido.');
  END IF;

  IF p_subtotal < v_coupon.min_order_value THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'message', format('Este cupom exige um pedido mínimo de R$ %s.', to_char(v_coupon.min_order_value, 'FM999G999D00'))
    );
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := round((p_subtotal * (v_coupon.discount_value / 100.0)), 2);
    IF v_coupon.max_discount IS NOT NULL AND v_discount > v_coupon.max_discount THEN
      v_discount := v_coupon.max_discount;
    END IF;
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  IF v_discount > p_subtotal THEN
    v_discount := p_subtotal;
  END IF;

  v_final_total := p_subtotal - v_discount;

  RETURN jsonb_build_object(
    'valid', true,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_amount', v_discount,
    'subtotal', p_subtotal,
    'final_total', v_final_total,
    'message', format('Cupom %s aplicado! Desconto de R$ %s concedido.', v_coupon.code, to_char(v_discount, 'FM999G999D00'))
  );
END;
$$;

-- Função RPC para computar uso do cupom após inserção do pedido
CREATE OR REPLACE FUNCTION record_coupon_usage(p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_code IS NOT NULL AND trim(p_code) <> '' THEN
    UPDATE coupons 
    SET times_used = times_used + 1 
    WHERE upper(code) = upper(trim(p_code));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_coupon_usage(TEXT) TO anon, authenticated;




