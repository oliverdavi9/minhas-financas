# Minhas Finanças

App de finanças pessoais para o iPhone: receitas e despesas, orçamento por categoria, compras parceladas e contas fixas, faturas por cartão e extrato.

É um app web instalável (PWA). Ele abre em tela cheia pelo ícone da tela de início, funciona sem internet com os últimos dados salvos no aparelho e sincroniza tudo pelo Supabase. Assim, os mesmos dados aparecem no celular e no computador.

## Como colocar para funcionar

### 1. Criar o banco no Supabase (grátis)

1. Entre em [supabase.com](https://supabase.com) e crie um projeto (**New project**). Anote a senha do banco que ele pedir.
2. No menu do projeto, abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email** se quiser criar a conta e entrar na hora. Se deixar ligado, o Supabase envia um e-mail de confirmação antes do primeiro acesso.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

### 2. Ligar o app ao Supabase

Você tem duas opções:

- **Pelo arquivo:** cole os dois valores em [`config.js`](config.js) e publique de novo.
- **Pelo próprio app:** deixe `config.js` vazio. Na primeira vez que abrir, o app pede a URL e a chave.

A chave *anon public* pode ficar no código. Ela foi feita para isso, e quem protege os dados são as regras de acesso (RLS) do `schema.sql`. Cada conta só lê e altera os próprios registros.

### 3. Publicar

O app está pronto para o **GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / raiz.

### 4. Instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone **Finanças**, crie sua conta e entre.

## Arquivos

| Arquivo | O que faz |
| --- | --- |
| `index.html` | Estrutura das telas |
| `styles.css` | Visual (vidro fosco, temas claro e escuro) |
| `app.js` | Telas e regras: parcelas, faturas, orçamento, gráficos |
| `db.js` | Login, sincronização com o Supabase, cópia local e backup |
| `config.js` | URL e chave do Supabase |
| `sw.js` | Guarda o app no aparelho para abrir sem internet |
| `manifest.webmanifest`, `icons/` | Nome e ícone do app instalado |
| `supabase/schema.sql` | Tabela e regras de acesso do banco |

## Publicar uma versão nova

Depois de mudar qualquer arquivo, aumente `VERSION` em `sw.js` (por exemplo, `mf-v2`). Assim, o iPhone baixa a versão nova na próxima vez que abrir o app.

## Backup

Em **Sua conta** (ícone de pessoa no topo), use **Exportar backup** para salvar um arquivo `.json` com todos os dados e **Importar backup** para restaurá-lo.
