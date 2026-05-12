alter table public."Users"
  add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_key
  on public."Users" (auth_user_id)
  where auth_user_id is not null;

