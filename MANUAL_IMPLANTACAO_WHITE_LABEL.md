# ✦ Manual Prático de Implantação White-Label & Gestão de Licenças — Soléria SaaS

> **Objetivo deste manual:** Guia passo a passo para você vender, implantar e gerenciar lojas completas para novas clientes (ex: *"Joias da Ana"*, *"Pratas da Maria"*), utilizando **domínio próprio da cliente**, **banco de dados isolado com custo R$ 0,00** e **controle total de mensalidade via Chave de Licença**.

---

## 🗺️ Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. NAVEGADOR DO CLIENTE (www.lojadaana.com.br)                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. SEU CLOUDFLARE PAGES (Hospedagem Gratuita & Segura)                      │
│    • Entrega o código HTML/CSS/JS ultra-rápido com SSL (HTTPS) automático.  │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
                   │ (Dados da Loja)                       │ (Checagem de Licença)
                   ▼                                       ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 3. SUPABASE DA CLIENTE (Projeto Free)│  │ 4. SEU SUPABASE MASTER            │
│    • Produtos e Fotos da Loja        │  │    • Tabela: licenses             │
│    • Pedidos e Clientes da Loja      │  │    • Valida: Pagou a mensalidade? │
│    • Custo: R$ 0,00                  │  │    • Se não pagou: Bloqueia Admin │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 📋 ETAPA 1: Criar o Banco de Dados Dedicado da Cliente (Supabase Free)

Cada cliente ganha seu próprio banco no plano gratuito do Supabase. Dessa forma, você nunca gasta com armazenamento de fotos e o banco de uma cliente nunca se mistura com o de outra.

### Passo 1.1: Criar o Projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e entre na sua conta (ou em uma conta criada para a cliente).
2. Clique em **"New Project"**.
3. Preencha os dados:
   - **Name:** Nome da loja da cliente (Ex: `Joias da Ana`).
   - **Database Password:** Gere uma senha forte e guarde em um bloco de notas seguro.
   - **Region:** Selecione **`South America (São Paulo)`** (fundamental para máxima velocidade no Brasil).
   - **Plan:** **Free ($0 / mês)**.
4. Clique em **"Create new project"** e aguarde cerca de 1 a 2 minutos até o banco inicializar.

### Passo 1.2: Rodar os Scripts de Estrutura do Banco (SQL Editor)
1. No menu lateral esquerdo do Supabase da cliente, clique no ícone **SQL Editor** (ícone de terminal `>_`).
2. Clique em **"New Query"**.
3. Abra o arquivo [schema_completo_loja_nova.sql](./schema_completo_loja_nova.sql) na pasta do seu projeto, copie todo o conteúdo e cole no SQL Editor.
4. Clique no botão verde **"Run"**.
   - Isso criará em 1 clique:
     - 💎 **Catálogo:** `products`, grade de aros (10-20), até 6 fotos, view financeira e de lucratividade;
     - 🏢 **Fornecedores & Lotes de Compra:** `vendors`, `purchase_batches`, `batch_items` e controle de custo de reposição;
     - 📦 **Insumos:** `supplies` e engenharia de custos (`product_supplies`);
     - 🛍️ **Vendas & Caixa:** `orders` com baixa parcial (`amount_paid` e `balance_due`) e triggers automáticos de estoque;
     - 👥 **CRM & Fidelização:** `customers` com autenticação segura e `coupons` com validação RPC.

### Passo 1.3: Armazenamento de Fotos (Criado Automaticamente pelo SQL! 🎉)
O próprio script [schema_completo_loja_nova.sql](./schema_completo_loja_nova.sql) executado no Passo 1.2 já cuida de tudo no Storage:
- ✅ Cria o bucket `Fotos Produtos` como **público**;
- ✅ Configura limite de 50MB por imagem;
- ✅ Cria automaticamente as 4 políticas de acesso RLS (leitura pública para o catálogo e permissão de upload/edição/exclusão pelo painel administrativo).

*Você não precisa criar nada manualmente no Storage! Se quiser apenas conferir, clique em **Storage** no menu lateral do Supabase e o bucket já estará lá ativo.*

### Passo 1.4: Criar o Usuário Administrador da Cliente
1. No menu lateral, clique em **Authentication > Users**.
2. Clique em **"Add user" > "Create user"**.
3. Digite o e-mail que a dona da loja usará para entrar (ex: `contato@joiasdaana.com.br`) e defina uma senha inicial segura (ex: `AnaJoias@2026`).
4. Marque **"Auto Confirm User?"** para que ela não precise confirmar por e-mail e possa logar de imediato.

### Passo 1.5: Copiar as Chaves de Conexão da Cliente
1. No menu lateral do Supabase, clique na engrenagem de configurações no canto inferior esquerdo (**Project Settings**).
2. Clique em **API** (sob a seção Configuration).
3. Copie e anote:
   - **Project URL:** Ex: `https://xyzabcdefg.supabase.co`
   - **Project API Keys (`anon` / `public`):** Ex: `eyJhbGciOi...`

---

## 🎨 ETAPA 2: Configurar Tudo Diretamente pelo seu Sistema Master (Sem Mexer em Código!)

Com o sistema de **Multi-Tenant e Licenças Master**, você **NÃO precisa editar arquivos de código, HTML ou CSS** para cada novo cliente.
Tudo é configurado centralmente no seu próprio painel administrativo: [admin-licencas.html](./admin-licencas.html).

### Passo 2.1: Rodar a Tabela Master de Licenças (Uma única vez)
No seu próprio Supabase Master (o da Soléria ou central), execute o script [schema_master_licencas.sql](./schema_master_licencas.sql) no **SQL Editor**. Esse script cria a tabela `public.licenses` com todos os campos de controle, cores, credenciais e RLS de leitura segura.

### Passo 2.2: Acessar a tela "Lojas & Licenças" no seu Painel Master
1. Abra o painel da sua loja Master em [admin.html](./admin.html) e clique no botão **"🔑 Lojas & Licenças"** no cabeçalho do painel 360° (ou acesse diretamente [admin-licencas.html](./admin-licencas.html)).
2. Clique no botão preto **"+ CADASTRAR NOVA LOJA PARCEIRA"**.

### Passo 2.3: Preencher os Parâmetros da Nova Loja no Formulário
Na tela que se abre, preencha os dados da contratante:

1. **Identificação da Loja:**
   - **Nome da Cliente / Marca:** Ex: `Joias da Ana`
   - **Domínio Autorizado:** Ex: `joiasdaana.com.br` ou `joias-da-ana.pages.dev`
   - **Chave de Licença:** Clique no botão de raio `⚡` para gerar um código único (ex: `SLR-ANA-2026-X8Y9`).
2. **Banco de Dados Dedicado da Cliente (Supabase Isolado):**
   - **Supabase URL do Cliente:** Cole a URL coletada no Passo 1.5 (ex: `https://xyzabcdefg.supabase.co`).
   - **Supabase Anon Key:** Cole a chave pública `anon` da cliente coletada no Passo 1.5.
3. **Identidade Visual e Cores:**
   - **URL da Logo:** Link da imagem da logo horizontal da cliente (ex: link hospedado, Supabase Storage público ou Imgur).
   - **URL do Ícone / Favicon:** Link do símbolo da marca da cliente.
   - **Cor Primária:** Escolha visualmente no seletor de cores ou digite o hexadecimal (ex: `#C48259`).
   - **Cor Secundária / Acento:** Escolha visualmente no seletor (ex: `#D4AF37`).
4. **Atendimento & Cobrança:**
   - **WhatsApp de Atendimento:** Número oficial com DDD (ex: `5511999999999`).
   - **Nome da Atendente:** Ex: `Ana` ou `Mariana`.
   - **Valor da Mensalidade (R$):** Ex: `97.00` ou `147.00`.
   - **Válido até:** Defina a data da primeira mensalidade (ex: daqui a 30 dias).
5. Clique em **"Salvar Parâmetros da Loja"**.

---

### Passo 2.4: Como o Sistema da Outra Empresa Aplica Tudo Automaticamente
O arquivo [assets/js/tenant-config.js](./assets/js/tenant-config.js) funciona como um **bootloader inteligente**:
1. Quando qualquer pessoa (ou a dona) abre o site ou painel no domínio dela (`joiasdaana.com.br`), o script consulta o seu Supabase Master.
2. **Injeção de Cores:** Ele aplica as variáveis CSS (`--brand-terracotta`, `--gold-primary`) dinamicamente no navegador, mudando botões, detalhes e cabeçalhos para as cores escolhidas no seu Master.
3. **Logos e Favicon:** Substitui as imagens de logo e o ícone da aba do navegador pelos links definidos no Master.
4. **Banco Isolado:** Alimenta as variáveis `window.TENANT_SUPABASE_URL` e `window.TENANT_SUPABASE_ANON_KEY`, fazendo com que o [assets/js/supabase.js](./assets/js/supabase.js) consulte exclusivamente o banco da cliente.
5. **WhatsApp:** Todos os botões de contato e finalização de pedido chamam automaticamente o WhatsApp e o nome da atendente cadastrados no Master.
6. **Bloqueio por Inadimplência:** Se a cliente não pagar a mensalidade na data estipulada, o painel [admin.html](./admin.html) dela é travado na hora com tela de aviso e botão direto para o seu WhatsApp para ela regularizar o Pix.

> 💡 **Vantagem Absoluta:** O código-fonte dos arquivos da loja da cliente permanece 100% limpo e idêntico. Se você quiser mudar uma cor, o WhatsApp ou atualizar o logo da cliente no futuro, basta alterar no seu painel Master!

---

## 🌐 ETAPA 3: Apontar o Domínio da Cliente no Cloudflare Pages

O Cloudflare Pages é onde os arquivos do site ficam online. Ele é **gratuito, não tem limite de visitantes, inclui certificado de segurança SSL (HTTPS) vitalício** e permite cadastrar domínios ilimitados.

### Passo 3.1: Subir o Projeto no GitHub
1. Crie um repositório no seu GitHub para a loja da cliente (ex: `github.com/SeuUsuario/joias-da-ana`).
2. Faça o commit e envie os arquivos da loja para esse repositório:
   ```bash
   git add .
   git commit -m "feat: setup inicial loja joias da ana"
   git push origin main
   ```

### Passo 3.2: Conectar no Cloudflare Pages
1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) e entre na sua conta Cloudflare.
2. No menu lateral, clique em **Workers & Pages**.
3. Clique em **"Create application" > aba "Pages" > "Connect to Git"**.
4. Selecione o repositório da cliente (ex: `joias-da-ana`).
5. Nas configurações de build:
   - **Framework preset:** Deixe como `None` (pois o projeto é Vanilla HTML/CSS/JS).
   - **Build command:** Deixe em branco.
   - **Build output directory:** Deixe em branco (ou `./`).
6. Clique em **"Save and Deploy"**.
7. Em cerca de 30 segundos, o site já estará no ar em um link gratuito (ex: `joias-da-ana.pages.dev`).

### Passo 3.3: Adicionar o Domínio Próprio da Cliente (ex: `joiasdaana.com.br`)
1. Dentro do projeto no Cloudflare Pages, clique na aba **"Custom domains"**.
2. Clique no botão **"Set up a custom domain"**.
3. Digite o domínio que a cliente comprou:
   - Exemplo: `joiasdaana.com.br` e `www.joiasdaana.com.br`.
4. O Cloudflare Pages vai te mostrar exatamente quais apontamentos DNS devem ser feitos.

### Passo 3.4: Como a Cliente Configura o Domínio no Registro.br (ou Hostgator/GoDaddy)
Diga para a cliente (ou faça para ela acessando a conta dela onde ela comprou o domínio):

#### No Registro.br:
1. Acesse o domínio no Registro.br e role até a seção **DNS**.
2. Clique em **"Editar Zona"** (ou "Configurar endereçamento").
3. Adicione 2 registros:
   - **Tipo CNAME:**
     - Nome: `www`
     - Destino: `joias-da-ana.pages.dev.` *(com o ponto no final)*
   - **Tipo A (ou redirecionamento do domínio raiz):**
     - O Cloudflare Pages indica o IP ou você pode usar os NameServers gratuitos da Cloudflare.

> 💡 **Dica Profissional (O modo mais fácil e blindado):**
> Se você trocar os **DNS (NameServers)** do domínio dela no Registro.br para os da sua Cloudflare (ex: `dave.ns.cloudflare.com` e `lola.ns.cloudflare.com`), o Cloudflare gerencia tudo com 1 clique, ativa o SSL HTTPS automaticamente e protege o site contra ataques com velocidade ultra-rápida.

---

## 🔒 ETAPA 4: Sistema de Bloqueio por Mensalidade & Chave Mestra (License Gatekeeper)

Esta etapa garante que **você tem o controle do interruptor**: se a cliente pagar a mensalidade, o painel funciona perfeitamente; se atrasar, o acesso ao painel é bloqueado automaticamente.

### Passo 4.1: Como funciona o Bloqueio Automático ([assets/js/tenant-config.js](./assets/js/tenant-config.js))
O script [assets/js/tenant-config.js](./assets/js/tenant-config.js) já vem incluído no cabeçalho das páginas da loja.
1. Sempre que a dona da loja ou a equipe dela abre o painel administrativo ([admin.html](./admin.html), [admin-pedidos.html](./admin-pedidos.html), etc.), o script consulta a tabela de licenças no seu Supabase Master.
2. Ele verifica duas condições:
   - O status da loja precisa ser **`active`**;
   - A data **`valid_until`** precisa ser igual ou superior à data de hoje.
3. Se a licença estiver vencida ou com status suspenso:
   - O painel é bloqueado na hora com uma tela escura de aviso elegante;
   - Exibe a data em que expirou;
   - Um botão com link direto para o seu WhatsApp permite que ela te envie o comprovante Pix de renovação.

---

### Passo 4.2: Como Renovar a Mensalidade Todo Mês (Em 1 Segundo!)
Quando a contratante te enviar o Pix da mensalidade (R$ 97,00, R$ 147,00, etc.) no WhatsApp:

1. Abra o seu painel Master em [admin-licencas.html](./admin-licencas.html).
2. Na linha da loja dela, basta clicar no botão verde **`⚡ +30 Dias`**.
3. O sistema calcula automaticamente mais 30 dias a partir da validade atual (ou da data de hoje), atualiza o banco e o painel dela é destravado no mesmo segundo.

> 💡 **Bloqueio Manual:** Se por qualquer motivo você precisar suspender a loja temporariamente (ex: cancelamento ou disputa), basta clicar no botão vermelho **`🔒 Bloquear`**. Para reativar, clique no botão verde **`🔓 Liberar`**.

---

## 📦 ETAPA 5: Checklist Rápido de Entrega para a Cliente

Antes de mandar as credenciais para a cliente:

- [ ] Domínio dela acessando com cadeado verde HTTPS (`https://www.joiasdaana.com.br`).
- [ ] Catálogo carregando e botão do WhatsApp chamando o número dela.
- [ ] Upload de 1 produto teste realizado no painel com foto no bucket `Fotos Produtos`.
- [ ] Realizado 1 pedido teste no checkout com baixa de estoque testada.
- [ ] Testado o filtro de **Baixa Parcial** e disparo de recibo no WhatsApp.
- [ ] Licença ativa no seu Supabase Master.

---

### 💬 Mensagem Pronta de Entrega para Enviar à Cliente

Copie e envie para a cliente no WhatsApp:

> *"Olá, Ana! ✨*
>
> *Sua plataforma exclusiva de joias está 100% pronta e no ar no seu domínio próprio! 💎*
>
> 🌐 **Link da sua Loja:** `https://www.joiasdaana.com.br`  
> 🔐 **Link do seu Painel de Gestão:** `https://www.joiasdaana.com.br/admin.html`  
>
> 👤 **Seu Login:** `contato@joiasdaana.com.br`  
> 🔑 **Sua Senha Inicial:** `AnaJoias@2026`  
> *(Você pode alterar a senha no primeiro acesso)*
>
> **O que já está configurado para você:**
> - Catálogo completo com grade de aros (10 ao 20);
> - Atendimento direto no seu WhatsApp em 1 clique;
> - Gestão de pedidos com opção de baixa parcial (entrada/sinal no Pix);
> - Controle de estoque e cálculo de lucro em tempo real.
>
> Qualquer dúvida no cadastro das suas peças, estou por aqui para te apoiar!"*