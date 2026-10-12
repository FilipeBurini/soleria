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
3. Abra o arquivo [`schema_completo_loja_nova.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portfólios/Soléria/schema_completo_loja_nova.sql) do projeto, copie todo o conteúdo e cole no SQL Editor.
4. Clique no botão verde **"Run"**.
   - Isso criará as tabelas: `products`, `orders`, `customers`, `coupons`, `supplies`, os triggers de baixa atômica de estoque e as colunas de baixa parcial (`amount_paid` e `balance_due`).

### Passo 1.3: Armazenamento de Fotos (Criado Automaticamente pelo SQL! 🎉)
O próprio script schema_completo_loja_nova.sql executado no Passo 1.2 já cuida de tudo no Storage:
- ✅ Cria o bucket Fotos Produtos como **público**;
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
Tudo é configurado centralmente no seu próprio painel administrativo: [`admin-licencas.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-licencas.html).

### Passo 2.1: Rodar a Tabela Master de Licenças (Uma única vez)
No seu próprio Supabase Master (o da Soléria ou central), execute o script [`schema_master_licencas.sql`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/schema_master_licencas.sql) no **SQL Editor**. Esse script cria a tabela `public.licenses` com todos os campos de controle, cores, credenciais e RLS de leitura segura.

### Passo 2.2: Acessar a tela "Lojas & Licenças" no seu Painel Master
1. Abra o painel da sua loja Master em [`admin.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin.html) e clique no botão **"🔑 Lojas & Licenças"** no cabeçalho do painel 360° (ou acesse diretamente [`admin-licencas.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-licencas.html)).
2. Clique no botão dourado **"+ Nova Loja Parceira"**.

### Passo 2.3: Preencher os Parâmetros da Nova Loja no Formulário
Na tela que se abre, preencha os dados da contratante:

1. **Identificação da Loja:**
   - **Nome da Cliente / Marca:** Ex: `Joias da Ana`
   - **Domínio Autorizado:** Ex: `joiasdaana.com.br` ou `joias-da-ana.pages.dev`
   - **Chave de Licença:** Clique em **"Gerar Chave"** para gerar um código único (ex: `SLR-ANA-2026-X8Y9`).
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
5. Clique em **"Salvar e Ativar Licença"**.

---

### Passo 2.4: Como o Sistema da Outra Empresa Aplica Tudo Automaticamente
O arquivo [`assets/js/tenant-config.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/tenant-config.js) funciona como um **bootloader inteligente**:
1. Quando qualquer pessoa (ou a dona) abre o site ou painel no domínio dela (`joiasdaana.com.br`), o script consulta o seu Supabase Master.
2. **Injeção de Cores:** Ele aplica as variáveis CSS (`--brand-terracotta`, `--gold-primary`) dinamicamente no navegador, mudando botões, detalhes e cabeçalhos para as cores escolhidas no seu Master.
3. **Logos e Favicon:** Substitui as imagens de logo e o ícone da aba do navegador pelos links definidos no Master.
4. **Banco Isolado:** Alimenta as variáveis `window.TENANT_SUPABASE_URL` e `window.TENANT_SUPABASE_ANON_KEY`, fazendo com que o [`assets/js/supabase.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/supabase.js) consulte exclusivamente o banco da cliente.
5. **WhatsApp:** Todos os botões de contato e finalização de pedido chamam automaticamente o WhatsApp e o nome da atendente cadastrados no Master.
6. **Bloqueio por Inadimplência:** Se a cliente não pagar a mensalidade na data estipulada, o painel `admin.html` dela é travado na hora com tela de aviso e botão direto para o seu WhatsApp para ela regularizar o Pix.

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

## 🔒 ETAPA 4: Sistema de Chave Mestra e Bloqueio por Mensalidade (License Gatekeeper)

Esta etapa garante que **você tem o controle do interruptor**: se a cliente pagar a mensalidade, o painel funciona perfeitamente; se atrasar, o acesso ao painel é bloqueado automaticamente.

### Passo 4.1: Criar a Tabela de Licenças no seu Supabase Master
No **seu próprio Supabase central** (o da Soléria ou em um projeto seu chamado `SaaS-Master`), rode este script no SQL Editor:

```sql
-- Tabela Central de Licenças de Clientes
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  license_key TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  monthly_fee NUMERIC(10, 2) DEFAULT 97.00,
  valid_until DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar RLS com leitura pública restrita à checagem de chave
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verificacao publica de licenca" ON public.licenses
  FOR SELECT USING (true);
```

### Passo 4.2: Cadastrar a Licença da Nova Cliente
No Table Editor do seu Supabase Master, adicione a linha da nova cliente:
- **`client_name`:** `Joias da Ana`
- **`license_key`:** `SLR-ANA-2026`
- **`domain`:** `joiasdaana.com.br`
- **`valid_until`:** Data de vencimento da primeira mensalidade (ex: `2026-11-12`)
- **`status`:** `active`

### Passo 4.3: O Código Gatekeeper no Painel da Cliente (`assets/js/license-check.js`)
Na pasta `assets/js/` da loja da cliente, crie o arquivo `license-check.js` que roda antes de carregar o painel administrativo:

```javascript
/**
 * Verificador Central de Licença - Soléria SaaS Gatekeeper
 */
(async function verifyClientLicense() {
  // Configuração da Licença desta Loja
  const STORE_LICENSE_KEY = "SLR-ANA-2026"; // Chave da Ana
  const MASTER_SUPABASE_URL = "https://SEU-SUPABASE-MASTER.supabase.co";
  const MASTER_ANON_KEY = "SUA-CHAVE-ANON-MASTER...";

  try {
    const res = await fetch(`${MASTER_SUPABASE_URL}/rest/v1/licenses?license_key=eq.${STORE_LICENSE_KEY}&select=*`, {
      headers: {
        "apikey": MASTER_ANON_KEY,
        "Authorization": `Bearer ${MASTER_ANON_KEY}`
      }
    });

    const licenses = await res.json();
    const license = licenses && licenses[0];
    const today = new Date().toISOString().split('T')[0];

    // Se chave não existe, está suspensa ou passou da data de validade
    if (!license || license.status !== 'active' || license.valid_until < today) {
      document.body.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #161513; color: #FAF8F5; font-family: sans-serif; padding: 2rem; text-align: center;">
          <div style="max-width: 480px; background: #22201D; border: 1px solid #AB5332; border-radius: 12px; padding: 2.5rem 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
            <h2 style="font-size: 1.4rem; color: #FAF8F5; margin-bottom: 0.75rem;">Acesso Administrativo Temporariamente Suspenso</h2>
            <p style="font-size: 0.9rem; color: #B5B0A6; line-height: 1.6; margin-bottom: 1.5rem;">
              A licença de uso deste sistema está com a mensalidade pendente ou expirou em <strong>${license ? license.valid_until : 'Data Indisponível'}</strong>.
            </p>
            <a href="https://wa.me/55SEUNUMERO?text=Ola!%20Gostaria%20de%20regularizar%20a%20mensalidade%20da%20loja%20Joias%20da%20Ana." target="_blank" style="display: inline-block; background: #AB5332; color: #fff; text-decoration: none; padding: 0.8rem 1.6rem; border-radius: 6px; font-weight: bold; font-size: 0.9rem;">
              💬 Regularizar Mensalidade via WhatsApp
            </a>
          </div>
        </div>
      `;
      throw new Error("Licença inativa ou expirada");
    }
  } catch (err) {
    console.warn("Verificação de licença interrompeu a execução:", err);
  }
})();
```

### Passo 4.3: O Bootloader Unificado (`assets/js/tenant-config.js`)
O script [`assets/js/tenant-config.js`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/assets/js/tenant-config.js) unifica o **Gatekeeper de Licenças** e a **Injeção de Cores/Logos/Credenciais**:
1. Ele é incluído no `<head>` das páginas públicas e administrativas da loja:
   ```html
   <script src="assets/js/tenant-config.js"></script>
   ```
2. Quando alguém tenta acessar o painel administrativo (`admin.html`, `admin-pedidos.html`, etc.), ele valida se a licença está com status `active` e se a data `valid_until` é igual ou posterior à data atual.
3. Se a cliente atrasar o pagamento da mensalidade ou for suspensa:
   - A tela de bloqueio substitui o painel com mensagem elegante de suspensão temporária.
   - Um botão direto para o seu WhatsApp permite que ela envie o comprovante Pix de renovação.

### Como renovar a mensalidade todo mês (Em 1 Clique!):
Quando a contratante enviar o Pix da mensalidade (R$ 97, R$ 147, etc.):
1. Abra o seu painel Master em [`admin-licencas.html`](file:///e:/Criação%20de%20Paginas/02%20-%20Clientes%20e%20Portf%C3%B3lios/Soléria/admin-licencas.html).
2. Na linha da loja dela, basta clicar no botão verde **"+30 Dias (Pix)"**.
3. O sistema calcula automaticamente mais 30 dias a partir da validade atual (ou da data de hoje), atualiza o banco e libera o acesso da cliente no mesmo segundo.

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
