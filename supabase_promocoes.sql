-- ==========================================================================
-- SOLÉRIA — SUPORTE A TELA DE PROMOÇÕES & OFERTAS
-- Execute este script no SQL Editor do seu Supabase para habilitar
-- o controle de itens em promoção diretamente na tabela products.
-- ==========================================================================

-- 1. Adiciona coluna is_promo (booleana) para indicar se o item está em promoção
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_promo BOOLEAN NOT NULL DEFAULT false;

-- 2. Adiciona coluna opcional promo_price para preços promocionais dedicados
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS promo_price NUMERIC(10,2);

-- 3. Cria índice para agilizar consultas da tela de promoções
CREATE INDEX IF NOT EXISTS idx_products_is_promo ON public.products(is_promo);

-- 4. Garante que os privilégios de leitura e escrita anônima/autenticada continuem liberados
GRANT ALL ON TABLE public.products TO anon, authenticated, service_role;

-- Comentário explicativo
COMMENT ON COLUMN public.products.is_promo IS 'Indica se a joia deve ser exibida com destaque na Tela de Promoções (promocoes.html)';
COMMENT ON COLUMN public.products.promo_price IS 'Preço promocional alternativo (opcional; se nulo, utiliza-se sale_price como valor promocional e original_price como De)';
