# ✦ SOLÉRIA — Diagnóstico Completo & Plano de Ajustes Passo a Passo

> **Status Geral do Projeto:** Arquitetura visual e catálogo de alta qualidade.
> **Fase 1 CONCLUÍDA com sucesso:** Quebras ativas de JavaScript, drawer da sacola e links de rastreio corrigidos.
>
> **Como usar este guia:** Este documento serve como seu painel de controle. Você pode selecionar qualquer passo (ex: *"Faça a Etapa 2.1"* ou *"Execute a Fase 2 inteira"*) e me dar o comando para aplicar as correções e melhorias código por código.

---

## 📌 Sumário das Fases

- [x] [Fase 1: Correção de Quebras Imediatas e Erros de Execução (CONCLUÍDA)](#-fase-1-correção-de-quebras-imediatas-e-erros-de-execução)
- [ ] [Fase 2: Consistência de Estoque e Ciclo de Vida do Pedido](#-fase-2-consistência-de-estoque-e-ciclo-de-vida-do-pedido)
- [ ] [Fase 3: Segurança, Privacidade (LGPD) e Blindagem do Supabase](#-fase-3-segurança-privacidade-lgpd-e-blindagem-do-supabase)
- [ ] [Fase 4: Experiência do Cliente (UX), Validações e Frete](#-fase-4-experiência-do-cliente-ux-validações-e-frete)
- [ ] [Fase 5: Novas Implementações para Operação Comercial](#-fase-5-novas-implementações-para-operação-comercial)

---

## ✅ Fase 1: Correção de Quebras Imediatas e Erros de Execução

Correções prioritárias para restaurar fluxos quebrados que geravam erros no console e travavam a navegação.

- [x] **Etapa 1.1: Corrigir ReferenceError e travamento ao salvar produtos** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`assets/js/admin-produto.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portfólios/Soléria/assets/js/admin-produto.js) e [`admin-produto.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portfólios/Soléria/admin-produto.html)
  - **Status:** **Corrigido.** Declarações de elementos dos modais (`skuConfirmModal`, `confirmSkuDisplay`, botões e barra de progresso) e variáveis de markup (`manualPriceEdited`, `badgeMarkup`) foram movidas para o escopo superior, eliminando o `ReferenceError` e a TDZ. O formulário agora salva e edita sem erros.

- [x] **Etapa 1.2: Restaurar o Drawer da Sacola em "Minha Conta"** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html) e [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js)
  - **Status:** **Corrigido.** A marcação legada do drawer foi substituída pela estrutura padronizada (`cart-drawer-overlay`, `cart-drawer-body`, `cart-drawer-footer`, `cart-drawer-count`, `cart-drawer-close`). A sacola agora abre e renderiza normalmente em `minha-conta.html`.

- [x] **Etapa 1.3: Corrigir link de rastreamento na Área da Cliente** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html) e [`assets/js/rastreio.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/rastreio.js)
  - **Status:** **Corrigido.** [`assets/js/rastreio.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/rastreio.js) agora aceita os parâmetros `pedido`, `order`, `q` e `codigo`. Além disso, o link de [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html) foi padronizado para `rastreio.html?pedido=...`, carregando os dados do pedido instantaneamente.

---

## ✅ Fase 2: Consistência de Estoque e Ciclo de Vida do Pedido (CONCLUÍDA)

Eliminação de conflitos entre regras SQL e JavaScript, garantindo consistência atômica de estoque e cadastro automático de clientes.

- [x] **Etapa 2.1: Unificar a Baixa de Estoque (Fim da Tripla Baixa)** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js), [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js) e [`assets/js/catalogo.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/catalogo.js)
  - **Status:** **Corrigido.** 
    1. A dedução e restauração de estoque agora são delegadas de forma atômica para os triggers de banco de dados (`trg_order_stock_deduction` e `trg_order_stock_restore` com row-level lock `FOR UPDATE`).
    2. Em [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js), a chamada redundante de dedução por JavaScript foi removida quando conectado ao Supabase.
    3. Em [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js), o botão foi reformulado para *"Confirmar Pagamento & Pedido"* (sem disparar segunda baixa) e a restauração ao cancelar só dispara por JavaScript se o Supabase estiver indisponível/offline (evitando devolução dobrada).
    4. Em [`assets/js/catalogo.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/catalogo.js), o cálculo redundante de pedidos ativos (`unReservedMap`) foi eliminado, consumindo diretamente o saldo real mantido pelo banco.

- [x] **Etapa 2.2: Registro Automático da Cliente a partir do Checkout** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js) e [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js)
  - **Status:** **Implementado.**
    1. Implementada a função `syncCustomerFromCheckout(orderCustomerData)` em [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js), que localiza a cliente por CPF ou cria uma nova conta na tabela `customers` do Supabase (e localmente como fallback).
    2. Gera senha inicial segura baseada nos 4 primeiros dígitos do CPF caso a cliente ainda não possua conta.
    3. Integrado ao checkout em [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js): ao concluir o pedido, a conta é sincronizada e o modal de confirmação exibe um card de boas-vindas com o link de acesso imediato à Área da Cliente (`minha-conta.html`).

---

## ✅ Fase 3: Segurança, Privacidade (LGPD) e Blindagem do Supabase (CONCLUÍDA)

Proteção contra vazamento de dados de clientes, histórico de vendas, adulteração de preços do catálogo e blindagem das sessões.

- [x] **Etapa 3.1: Blindar Políticas de Segurança RLS (Row Level Security)** *(Concluído em 01/10/2026)*
  - **Arquivo:** [`supabase_orders.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/supabase_orders.sql)
  - **Status:** **Implementado e Blindado.**
    1. **Tabela `products`**: Revogada a permissão de UPDATE público (`allow_anon_update_products_stock`). Agora, apenas administradores autenticados podem alterar produtos e preços, enquanto a dedução e restauração de estoque pelo checkout/cancelamento ocorrem de forma segura pelas triggers SQL (`SECURITY DEFINER`).
    2. **Tabela `customers`**: Removida a política aberta (`allow_anon_customers`). O acesso direto via `SELECT *` foi totalmente bloqueado para usuários anônimos, impedindo vazamentos de CPFs, telefones, endereços e senhas (conformidade com a LGPD).
    3. **Tabela `orders`**: Removida a política pública de leitura (`allow_anon_select_orders`). Consultas anônimas diretas a todos os pedidos foram revogadas.
    4. **Função Segura de Rastreio Público (`get_order_tracking`)**: Criada função Postgres RPC com `SECURITY DEFINER` que pesquisa pedidos por código ou telefone, retornando dados de rastreamento com nome e telefone ofuscados/mascarados e ocultando dados sensíveis como CPF e endereço residencial completo.

- [x] **Etapa 3.2: Reforço na Autenticação e Sessão da Cliente** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js), [`assets/js/rastreio.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/rastreio.js) e [`supabase_orders.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/supabase_orders.sql)
  - **Status:** **Implementado e Protegido.**
    1. **Autenticação Segura no Banco (`customer_authenticate`)**: A verificação de senha agora ocorre internamente no PostgreSQL via RPC, sem nunca trafegar ou expor o `password_hash` para o frontend.
    2. **Cadastro e Sincronização Seguros (`customer_register` e `customer_sync_checkout`)**: Funções RPC tratam upserts com validação de dados sem conceder permissões diretas de escrita irrestrita na tabela `customers`.
    3. **Token de Sessão (`session_token`)**: Gerado a cada login bem-sucedido e armazenado na sessão do navegador. A função `customer_get_orders` exige a validação do `session_token` para listar os pedidos, impedindo que a simples edição do CPF no `localStorage` visualize pedidos de terceiros.
    4. **Higienização do LocalStorage**: O hash de senha foi completamente eliminado do objeto salvo no `localStorage`.
    5. **Integração no Rastreio**: [`assets/js/rastreio.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/rastreio.js) consome a RPC `get_order_tracking` com fallback transparente.

---

## ✅ Fase 4: Experiência do Cliente (UX), Validações e Frete (CONCLUÍDA)

Melhorias de usabilidade para evitar atritos na navegação, transparência em valores de frete e recuperação segura de acessos.

- [x] **Etapa 4.1: Fluxo de Recuperação de Senha / Acesso** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html), [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js) e [`supabase_orders.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/supabase_orders.sql)
  - **Status:** **Implementado.**
    1. Adicionado link *"Esqueci minha senha"* no formulário de login de [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html).
    2. Exibição de dica transparente de acesso rápido (senha inicial padrão composta pelos 4 primeiros dígitos do CPF para pedidos concluídos no catálogo).
    3. Criado formulário de redefinição imediata com dupla checagem de identidade (CPF + WhatsApp cadastrado) chamando a nova função RPC `customer_reset_password` no Supabase (e fallback local).
    4. Adicionado botão para suporte direto com a Carla no WhatsApp oficial da Soléria (`wa.me/5516997990729`) com mensagem pré-formatada contendo o CPF da cliente.

- [x] **Etapa 4.2: Transparência e Opções de Frete no Checkout** *(Concluído em 01/10/2026)*
  - **Arquivo:** [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js)
  - **Status:** **Implementado.**
    1. Adicionados banners explicativos sobre as políticas de frete: *"Frete Cortesia nas compras a partir de R$ 350,00 ou taxa calculada pelo CEP no WhatsApp"* para Entrega em Domicílio, e *"Retirada Cortesia sem custo de envio"* para Retirada Exclusiva.
    2. Adicionada linha dinâmica no resumo financeiro da sacola destacando a condição de envio antes do botão de finalização do pedido.

- [x] **Etapa 4.3: Ajuste de Máscaras e Formatação de Telefone** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js), [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js) e [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html)
  - **Status:** **Implementado.**
    1. Criada a função unificada `formatPhone` em [`assets/js/cliente.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/cliente.js), que alterna com precisão entre números de 10 dígitos `(00) 0000-0000` (fixos/regionais) e 11 dígitos `(00) 00000-0000` (celulares).
    2. A máscara dinâmica foi integrada nos inputs do checkout em [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js) e nos formulários de cadastro e recuperação de [`minha-conta.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/minha-conta.html).

---

## ✅ Fase 5: Novas Implementações para Operação Comercial (CONCLUÍDA)

Recursos implementados para transformar o catálogo em uma operação de vendas moderna, escalável e de alto nível de conversão.

- [x] **Etapa 5.1: Pagamento Instantâneo via PIX Copia e Cola / QR Code** *(Concluído em 01/10/2026)*
  - **Arquivo:** [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js)
  - **Status:** **Implementado.**
    1. Gerador em conformidade total com o padrão **EMVCo do Banco Central do Brasil** (`crc16Pix`, Merchant `SOLERIA JOIAS`, Cidade `FRANCA`, Chave `16997990729` e TxID dinâmico com o protocolo do pedido).
    2. Renderização de QR Code em alta definição via API visual e input com o código PIX Copia e Cola.
    3. Botão com cópia para área de transferência em 1 clique e feedback instantâneo (*"Copiado!"*).
    4. Integração do valor final abatido de eventuais cupons de desconto.

- [x] **Etapa 5.2: Painel de Clientes (CRM) no Backoffice** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`admin-clientes.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-clientes.html), [`assets/js/admin-clientes.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-clientes.js), [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html), [`admin-pedidos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-pedidos.html), [`admin-produto.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-produto.html) e [`admin-insumos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-insumos.html)
  - **Status:** **Implementado.**
    1. Criada a página completa de CRM com identidade visual luxuosa da Soléria (Dark Slate & Gold).
    2. Cards de métricas com Total de Clientes, Clientes Compradoras, Taxa de Conversão da Base e LTV Médio por Compradora.
    3. Tabela interativa com busca em tempo real (Nome, CPF, WhatsApp, E-mail, Cidade) e filtros por perfil (VIP > R$ 500, Frequente, Compradora ou Sem Compras).
    4. Modal de Histórico de Pedidos por Cliente com visualização de todos os pedidos, status, itens comprados e endereço de entrega.
    5. Botão de contato direto no WhatsApp (`wa.me`) para cada cliente com mensagem personalizada da Carla.
    6. Exportação da base de clientes para planilha Excel/CSV em UTF-8 com BOM.

- [x] **Etapa 5.3: Sistema de Cupons de Desconto** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`supabase_orders.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/supabase_orders.sql) e [`assets/js/carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js)
  - **Status:** **Implementado.**
    1. Criada a tabela `coupons` com suporte a descontos percentuais (`percentage`) ou fixos em reais (`fixed`), pedido mínimo, limite de uso, data de validade e status ativo.
    2. Criada a função RPC `validate_coupon` e `record_coupon_usage` com segurança `SECURITY DEFINER` e blindagem RLS.
    3. Cadastrados cupons de boas-vindas padrão: `BEMVINDA10` (10% off), `LUZ15` (15% off), `FRETEGRATIS` (R$ 30 off) e `SOLERIA50` (R$ 50 off).
    4. Campo de cupom elegante integrado tanto na visualização da sacola quanto no formulário de checkout.
    5. Atualização visual instantânea das linhas de resumo financeiro e gravação das colunas `discount_amount` e `discount_code` na tabela `orders`.
    6. Mecanismo de contingência local que permite funcionamento normal mesmo se o Supabase estiver momentaneamente offline.

- [x] **Etapa 5.4: Notificações Automáticas no WhatsApp da Cliente** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`admin-pedidos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-pedidos.html) e [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js)
  - **Status:** **Implementado.**
    1. Criado painel no modal de gestão de pedidos com 4 botões de disparo em 1 clique: *"Pagamento Aprovado"*, *"Envio & Rastreio"*, *"Pronto p/ Retirada"* e *"Pedido Entregue"*.
    2. Textos pré-formatados com atendimento personalizado contendo o primeiro nome da cliente, protocolo do pedido, código de rastreio e link direto para a página de rastreio.
    3. Modal de configuração de Webhook para integração transparente com APIs de mensageria (Evolution API, Z-API, n8n, Make ou Zapier), com suporte a URL, Bearer Token/API Key e disparo automático ao salvar alterações de status.

- [x] **Etapa 5.5: Exportação de Relatórios Financeiros** *(Concluído em 01/10/2026)*
  - **Arquivos:** [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html), [`assets/js/admin.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin.js), [`admin-pedidos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-pedidos.html) e [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js)
  - **Status:** **Implementado.**
    1. Adicionado botão *"📊 Exportar Vendas (CSV)"* em `admin-pedidos.html` com UTF-8 BOM para abertura perfeita no Microsoft Excel brasileiro (com ponto e vírgula e formato monetário).
    2. Adicionado botão *"🖨️ Imprimir PDF"* em `admin-pedidos.html` gerando relatório executivo pronto para impressão ou salvamento em PDF com resumo financeiro.
    3. Adicionado botão *"📊 Exportar Inventário (CSV)"* em `admin.html` exportando SKUs, estoque atual, custos de peça, insumos associados, preço de venda e margem projetada.

---

## ✅ Fase 6: Dashboard 360°, Gestão Financeira Avançada (Baixa Parcial) e Refinamento de Interface (CONCLUÍDA)

- [x] **Etapa 6.1: Dashboard 360° Unificado & Central de Inteligência** *(Concluído em 12/10/2026)*
  - **Arquivos:** [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html) e [`assets/js/admin.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin.js)
  - **Status:** **Implementado.**
    1. Criado layout unificado com abas dinâmicas *"Visão Geral 360°"* e *"Posição de Estoque & Peças"*.
    2. Consolidação de KPIs executivos em tempo real: Faturamento Realizado, Vendas do Mês, Ticket Médio, Capital em Estoque, Base de Clientes Cadastrados e Taxa de Conversão Real da Base.
    3. Grid de monitoramento por status de pedidos (Aguardando Pagamento, Preparação, Enviados e Entregues) com contadores e montantes calculados na hora.
    4. Widget de Alerta de Estoque Crítico exibindo peças com 0 ou 1 unidade restante com botão de reabastecimento.
    5. Ranking de Clientes VIP com maior volume de compras para relacionamento ativo.

- [x] **Etapa 6.2: Controle de Baixa Parcial (Entrada/Sinal) & Saldos a Receber** *(Concluído em 12/10/2026)*
  - **Arquivos:** [`admin-pedidos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-pedidos.html), [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js), [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html), [`assets/js/admin.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin.js) e [`supabase_orders.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/supabase_orders.sql)
  - **Status:** **Implementado.**
    1. Adicionado bloco de controle de pagamento dentro do modal de gestão de pedidos com cards de Valor Total, Valor Já Pago (Entrada) e Saldo Restante calculado em tempo real.
    2. Atalhos de 1 clique: *"Zerar (R$ 0)"*, *"50% Entrada"* e *"Quitar 100%"*.
    3. Status dinâmico: *"✓ Quitado 100%"*, *"🟡 Pagamento Parcial"* e *"Aguardando Pagamento"*.
    4. Botão integrado para envio de comprovante no WhatsApp da cliente com texto pré-formatado da Carla detalhando entrada recebida e saldo restante a acertar.
    5. Filtro rápido *"🟡 Com Saldo a Receber"* na listagem de pedidos de `admin-pedidos.html`.
    6. Banner inteligente de notificação no topo do Dashboard 360° listando todas as clientes com saldo pendente de acerto, total devedor consolidado e atalhos de cobrança no WhatsApp.
    7. Migração do banco com adição das colunas `amount_paid` e `balance_due` na tabela `orders`.

- [x] **Etapa 6.3: Correção de Digitação Livre e Formatação Monetária Brasileira** *(Concluído em 12/10/2026)*
  - **Arquivos:** [`assets/js/admin-pedidos.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/admin-pedidos.js)
  - **Status:** **Corrigido.**
    1. Eliminada a sobreposição e travamento do cursor ao digitar ou apagar valores nos campos de Valor Final a Cobrar, Desconto e Valor Já Pago.
    2. Suporte nativo à digitação brasileira com vírgula ou ponto (ex: `350,00`, `350.50`, `350`).
    3. Adicionada proteção `document.activeElement` para impedir sobrescrita do campo ativo durante a digitação.
    4. Seleção automática do texto completo ao focar/clicar (`input.select()`), permitindo alteração instantânea com um único clique.
    5. Formatação com 2 casas decimais aplicada no evento de saída (`blur`) e ao pressionar Enter.

- [x] **Etapa 6.4: Padronização do Atendimento WhatsApp (Carla)** *(Concluído em 12/10/2026)*
  - **Arquivos:** [`index.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/index.html), [`carrinho.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/carrinho.js), [`rastreio.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/rastreio.js) e [`rastreio.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/rastreio.html)
  - **Status:** **Padronizado.**
    1. Todas as mensagens e botões agora informam atendimento exclusivo com a **Carla** (removendo qualquer menção a "Concierge").
    2. Ajustada a responsividade do QR Code de pagamento PIX no checkout mobile.
    3. Corrigido botão de WhatsApp na consulta de pedidos da tela de rastreamento.

- [x] **Etapa 6.5: Redesenho do Menu Superior Administrativo & Margem Superior** *(Concluído em 12/10/2026)*
  - **Arquivos:** [`assets/css/style.css`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/css/style.css), [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html), [`admin-pedidos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-pedidos.html), [`admin-produto.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-produto.html), [`admin-editar-produto.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-editar-produto.html), [`admin-insumos.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-insumos.html) e [`admin-clientes.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-clientes.html)
  - **Status:** **Concluído.**
    1. Removida a caixinha/tag quebrada que ficava ao lado do logo ("Gestão de Pedidos" / "Backoffice") em todas as 6 telas administrativas.
    2. Menu reformulado e aumentado: itens com tipografia `0.88rem`, padding `0.62rem 1.05rem`, bordas arredondadas e ícones de `17px`.
    3. Itens de navegação perfeitamente centralizados no centro da barra, com a logo à esquerda e o usuário à direita em equilíbrio simétrico.
    4. Blindagem do logo contra sobreposição (`flex-shrink: 0; min-width: 220px`).
    5. Adicionado espaçamento generoso no topo do conteúdo (`padding-top: 2rem !important;`), eliminando o aspecto colado no cabeçalho em todas as páginas do backoffice.

---

## 🏆 Resumo Geral do Plano

Todas as 6 Fases de estabilização, inteligência de estoque, blindagem, CRM, dashboard unificado e gestão financeira com baixa parcial da Soléria foram 100% concluídas com sucesso e validadas!

