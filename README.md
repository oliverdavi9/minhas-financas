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
| `importar.js` | Leitura de planilhas do Excel e CSV |
| `config.js` | URL e chave do Supabase |
| `sw.js` | Guarda o app no aparelho para abrir sem internet |
| `manifest.webmanifest`, `icons/` | Nome e ícone do app instalado |
| `supabase/schema.sql` | Tabela e regras de acesso do banco |

## Publicar uma versão nova

Depois de mudar qualquer arquivo, aumente `VERSION` em `sw.js` (por exemplo, `mf-v2`). Assim, o iPhone baixa a versão nova na próxima vez que abrir o app.

## Busca e filtros

Toda tela tem uma barra de busca e filtros acima da lista principal. A busca ignora acentos e acha pela descrição, categoria, cartão, pessoa, valor ou data. Os filtros variam por tela: tipo, situação, categoria, forma de pagamento e de quem é. **Limpar** volta tudo ao normal.

## A receber

Para compras feitas para outra pessoa (no seu cartão ou por Pix), ligue **É de outra pessoa** ao lançar a despesa e escreva o nome dela. O valor entra na fatura do cartão, mas não conta como sua despesa.

Quando a pessoa te pagar, registre em **A receber** → **Recebi**, ou lance uma receita com **É pagamento de alguém que me devia**. O pagamento não conta como receita. Cada pessoa mostra quanto já pagou, quanto falta até o mês exibido e quanto ainda vai vencer. Os pagamentos abatem primeiro as dívidas mais antigas.

Na mesma tela, a aba **Lançamentos** lista só as compras de outras pessoas e os pagamentos delas no mês, com filtro por pessoa.

## Importar uma planilha

Em **Sua conta** (ícone de pessoa no topo), toque em **Importar planilha do Excel** e escolha o arquivo: Excel (.xlsx ou .xls), Numbers, Google Planilhas baixada como .xlsx, ou .csv.

- O app procura as colunas de data, descrição, valor, categoria, cartão ou forma de pagamento, e parcela (como `3/10`). Se ele errar alguma, use **Ajustar colunas** em cada aba.
- Funciona com uma aba por mês (Janeiro, Fevereiro…), com uma lista única e com planilhas de orçamento que têm os meses lado a lado.
- Compras parceladas viram parcelamentos e continuam aparecendo nos meses seguintes. Se a mesma compra aparece em vários meses (3/10, 4/10…), ela vira um parcelamento só.
- Cartões que ainda não existem no app são criados. Na prévia você informa o dia de fechamento e de vencimento de cada um.
- Linhas de total e saldo são ignoradas, e o que já estava no app não entra de novo.
- Cada importação aparece em **Importações anteriores** e pode ser desfeita.

## Backup

Em **Sua conta** (ícone de pessoa no topo), use **Exportar backup** para salvar um arquivo `.json` com todos os dados e **Importar backup** para restaurá-lo.
