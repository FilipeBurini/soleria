# Soléria — Haute Joaillerie & Accessoires

> **Plataforma web de alta joalheria:** Catálogo público de luxo para clientes com concierge WhatsApp integrado, acompanhado de um backoffice administrativo completo com gestão de insumos, precificação inteligente, cálculo de margem de lucro em tempo real e grade de aros para anéis.

---

## 📖 Visão Geral

O projeto **Soléria** foi desenvolvido com foco em performance extrema, elegância visual e autonomia total:
- **100% Vanilla (Sem dependências pesadas):** Construído exclusivamente com **HTML5 semântico, CSS3 moderno e JavaScript ES6+ puro**. Não utiliza Node.js no runtime, dispensando compilação, builds pesados ou vulnerabilidades de frameworks.
- **Backend-as-a-Service com Supabase:** Utiliza o Supabase para banco de dados relacional (PostgreSQL), autenticação segura de operadores (Supabase Auth) e armazenamento de fotos (Supabase Storage).
- **Pronto para Cloudflare Pages & Edge Hosting:** Como todo o código é estático, o deploy é instantâneo e possui custo zero de infraestrutura com tempo de resposta global ultra-rápido.

---

## 💎 Principais Funcionalidades

### 1. Catálogo Público de Peças ([`index.html`](index.html))
- **Estética Editorial de Alto Padrão:** Identidade visual sofisticada com paleta baseada em tons quentes, dourado nobre e terracota (`#AB5332`), tipografia clássica e micro-interações fluidas.
- **Filtros e Busca Instantânea:** Filtragem dinâmica por categorias (Anéis, Colares, Brincos, Pulseiras, etc.) e busca textual em tempo real por nome ou descrição.
- **Grade de Aros em Estoque (Anéis):** Exibe para o cliente **apenas os tamanhos (Aro 10 ao 20) que realmente possuem peças disponíveis** (`> 0`), indicando a quantidade de unidades restantes.
- **Modal de Detalhes & Galeria:** Visualização ampliada com suporte a até 6 fotos em alta resolução por peça e troca intuitiva de miniaturas.
- **Atendimento WhatsApp Concierge:** Ao selecionar um aro e clicar no botão de atendimento, o cliente é direcionado ao WhatsApp com uma mensagem personalizada já preenchida contendo o nome da joia, valor e o aro selecionado.
- **Proteção Total de Dados Sensíveis:** O catálogo é estritamente restrito pela segurança do banco (RLS) — custos de fabricação, insumos e margem de lucro nunca são transmitidos ao navegador do cliente.

### 2. Painel Administrativo & Dashboard Financeiro ([`admin.html`](admin.html))
- **Acesso Restrito:** Autenticação bloqueante com e-mail e senha via **Supabase Auth**.
- **Indicadores Chave de Performance (KPIs):**
  - **Capital Investido em Estoque:** $\sum (\text{Custo de Fabricação} + \text{Insumos}) \times \text{Quantidade em Estoque}$.
  - **Lucro Total Projetado:** $\sum \text{Lucro Unitário} \times \text{Quantidade em Estoque}$.
  - **Volume de Acervo:** Total de peças físicas em estoque e quantidade de modelos cadastrados.
- **Tabela Consolidada de Estoque:** Consulta em tempo real com filtros por status (Ativo/Inativo), campo de busca rápida por SKU ou nome, margens calculadas e botão de edição direta.

### 3. Cadastro Inteligente de Produtos & Insumos ([`admin-produto.html`](admin-produto.html))
- **Geração Automática de SKU:** Padronização com base nas três primeiras letras da categoria seguidas de numeração sequencial (ex: `ANE-0001`, `COL-0002`).
- **Grade Dinâmica de Aros (Aros 10 ao 20):** Ao selecionar ou digitar a categoria "Anéis", a grade de aros se abre automaticamente. Ao preencher as unidades de cada aro, o **estoque total é somado em tempo real**.
- **Engenharia de Custos ao Vivo:** Permite vincular múltiplos insumos cadastrados à peça (ex: banho de ouro, embalagem de veludo, pedras). O sistema soma o custo da peça + insumos e calcula a margem de lucro unitária instantaneamente conforme o preço de venda é digitado.
- **Upload Automatizado de Imagens:** Envio direto para o **Supabase Storage** no bucket `Fotos Produtos`. O sistema cria e organiza automaticamente as imagens dentro de subpastas nomeadas com o **SKU do produto** (ex: `Fotos Produtos/AN5032/foto-1.jpg`). Também suporta inserção direta de links de imagem.

### 4. Gestão de Matérias-Primas e Insumos ([`admin-insumos.html`](admin-insumos.html))
- Cadastro centralizado de embalagens, metais, gemas e serviços terceirizados.
- Definição de custo unitário e unidade de medida (`un`, `g`, `cm`, `par`, `ml`, etc.).
- Atualização e exclusão com proteção relacional.

---

## 📁 Estrutura do Repositório

```text
soleria/
├── index.html                   # Catálogo público para os clientes
├── admin.html                   # Dashboard administrativo, KPIs e listagem de acervo
├── admin-produto.html           # Cadastro e edição de produtos, aros e composição de custos
├── admin-insumos.html           # Gestão de matérias-primas e insumos de produção
├── assets/
│   ├── css/
│   │   └── style.css            # Folha de estilos unificada e responsiva
│   ├── js/
│   │   ├── supabase.js          # Inicializador do Supabase e utilitários globais
│   │   ├── catalogo.js          # Lógica do catálogo público, filtros, aros e modal
│   │   ├── admin.js             # Lógica do dashboard, autenticação e KPIs
│   │   ├── admin-produto.js     # Lógica do cadastro, SKU, imagens e cálculo de margem
│   │   └── admin-insumos.js     # Lógica de gerenciamento de insumos
│   └── images/
│       ├── logo-sem-fundo.png   # Logotipo oficial Soléria
│       ├── logo-simbolo.png     # Símbolo oficial Soléria (emblema e favicon)
│       └── logo-horizontal.png  # Versão horizontal do logotipo
├── Identidade visual/           # Arquivos de arte e vetorização originais
├── .gitignore                   # Arquivos ignorados pelo Git
└── README.md                    # Documentação completa do projeto
```

---

## 🗄️ Estrutura do Banco de Dados (Supabase SQL)

Para recriar ou atualizar a estrutura completa no seu Supabase, acesse o **SQL Editor** no painel do Supabase e execute o script abaixo:

```sql
-- 1. Extensões essenciais
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Insumos (Matérias-Primas / Embalagens)
CREATE TABLE IF NOT EXISTS supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL DEFAULT 'un',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Produtos (com suporte a Grade de Aros JSONB e até 6 fotos)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    sizes JSONB DEFAULT '{}'::jsonb,
    product_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garante colunas essenciais caso a tabela já existisse
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS product_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';

-- 4. Tabela de Vínculo: Produto x Insumos
CREATE TABLE IF NOT EXISTS product_supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    supply_id UUID REFERENCES supplies(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,4) NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Índices de Chaves Estrangeiras (Otimização de Performance)
CREATE INDEX IF NOT EXISTS idx_product_supplies_product_id ON product_supplies(product_id);
CREATE INDEX IF NOT EXISTS idx_product_supplies_supply_id ON product_supplies(supply_id);

-- 6. View Consolidada de Indicadores Financeiros (Security Invoker)
CREATE OR REPLACE VIEW products_financials WITH (security_invoker = true) AS
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
    products p
LEFT JOIN
    product_supplies ps ON p.id = ps.product_id
LEFT JOIN
    supplies s ON ps.supply_id = s.id
GROUP BY
    p.id, p.sku, p.name, p.category, p.product_cost, p.sale_price, p.stock, p.status;

-- 7. Políticas de Segurança (Row Level Security - RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_supplies ENABLE ROW LEVEL SECURITY;

-- Remove políticas anteriores para evitar duplicações
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename IN ('products', 'supplies', 'product_supplies')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Catálogo Público: visitantes só leem produtos com status 'ativo'
CREATE POLICY "anon_select_active_products" 
ON products FOR SELECT 
TO anon 
USING (status = 'ativo');

-- Administradores: acesso total a produtos
CREATE POLICY "admin_all_products" 
ON products FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- Administradores: acesso total a insumos
CREATE POLICY "admin_all_supplies" 
ON supplies FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- Administradores: acesso total ao vínculo de insumos
CREATE POLICY "admin_all_product_supplies" 
ON product_supplies FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- Permissões na view restritas aos administradores autenticados
GRANT SELECT ON products_financials TO authenticated;
REVOKE ALL ON products_financials FROM anon;
```

---

## ☁️ Configuração do Storage para Imagens

1. No painel do **Supabase**, abra o menu **Storage**.
2. Crie ou utilize o bucket com o nome: `Fotos Produtos`.
3. Defina o bucket como **Public Bucket** (permitindo que as imagens sejam carregadas diretamente nos navegadores via URL pública).
4. O sistema cria automaticamente a estrutura organizada por SKU durante o upload:
   ```text
   Fotos Produtos/
   ├── AN5032/
   │   ├── an5032_1.jpg
   │   └── an5032_2.jpg
   └── AN5172-3/
       ├── an5172-3_1.jpg
       └── an5172-3_2.jpg
   ```

---

## 🚀 Publicação no Cloudflare Pages

Por se tratar de uma aplicação puramente estática, a hospedagem no **Cloudflare Pages** leva menos de 2 minutos:

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/) e vá em **Workers & Pages > Pages**.
2. Clique em **Connect to Git** e selecione o repositório `FilipeBurini/soleria`.
3. Defina as configurações de build:
   - **Framework preset:** `None` (ou deixe em branco).
   - **Build command:** *(deixe em branco)*.
   - **Build output directory:** `.` *(ou deixe em branco, pois os arquivos HTML estão na raiz)*.
4. Clique em **Save and Deploy**.
5. Seu site estará publicado mundialmente com HTTPS gratuito, proteção DDoS da Cloudflare e carregamento ultra-rápido.

---

## 🔒 Segurança e Melhores Práticas

- **Credenciais Seguras:** A chave utilizada no front-end (`SUPABASE_ANON_KEY`) é pública por design. Todas as proteções de dados críticos são feitas pelo **RLS no banco de dados**.
- **Sem Exposição de Custos:** As tabelas de `supplies`, `product_supplies` e a view `products_financials` são totalmente bloqueadas para visitantes anônimos.
- **Security Invoker:** A view financeira foi configurada com `security_invoker = true`, garantindo que o PostgreSQL valide a identidade do usuário antes de liberar os dados.

---

## 📄 Licença

Projeto desenvolvido para a marca **Soléria — Haute Joaillerie & Accessoires**. Todos os direitos reservados.
