create table if not exists public."SpotifyOAuthTokens" (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  token_type text not null default 'Bearer',
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_error text
);

alter table public."SpotifyOAuthTokens" enable row level security;

revoke all on table public."SpotifyOAuthTokens" from anon;
revoke all on table public."SpotifyOAuthTokens" from authenticated;

create index if not exists spotify_oauth_tokens_expires_at_idx
  on public."SpotifyOAuthTokens" (expires_at);
