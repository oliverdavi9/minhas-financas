-- Minhas Finanças — banco de dados no Supabase
-- Cole tudo isto no SQL Editor do seu projeto e clique em Run. Só precisa rodar uma vez.
--
-- Cada registro do app (lançamento, parcelamento, cartão, fatura paga, orçamento)
-- é uma linha da tabela "docs". As regras de acesso (RLS) garantem que cada pessoa
-- só lê e altera as próprias linhas.

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  colecao    text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, colecao, id)
);

alter table public.docs enable row level security;

drop policy if exists "ler os próprios dados" on public.docs;
drop policy if exists "criar os próprios dados" on public.docs;
drop policy if exists "alterar os próprios dados" on public.docs;
drop policy if exists "apagar os próprios dados" on public.docs;

create policy "ler os próprios dados" on public.docs
  for select to authenticated using (auth.uid() = user_id);
create policy "criar os próprios dados" on public.docs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "alterar os próprios dados" on public.docs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apagar os próprios dados" on public.docs
  for delete to authenticated using (auth.uid() = user_id);

-- atualização em tempo real entre aparelhos (celular e computador)
alter table public.docs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
