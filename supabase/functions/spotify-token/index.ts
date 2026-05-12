import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TOKEN_REFRESH_BUFFER_MS = 90_000
const DEFAULT_EXPIRES_IN_SECONDS = 3600

type SpotifyTokenRow = {
  auth_user_id: string
  access_token_ciphertext: string
  access_token_iv: string
  refresh_token_ciphertext: string | null
  refresh_token_iv: string | null
  token_type: string | null
  scopes: string | null
  expires_at: string | null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function encryptionKey() {
  const keyMaterial =
    Deno.env.get('SPOTIFY_TOKEN_ENCRYPTION_KEY') ??
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(keyMaterial),
  )
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  }
}

async function decryptSecret(ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return { user: null, error: 'Authorization header is required' }
  }

  const authClient = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_ANON_KEY'),
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  )

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser()

  return {
    user,
    error: error?.message ?? (!user ? 'Authenticated user not found' : ''),
  }
}

function adminClient() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )
}

function tokenExpiresAt(expiresInSeconds: unknown) {
  const seconds = Number(expiresInSeconds)
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 60
      ? seconds
      : DEFAULT_EXPIRES_IN_SECONDS
  return new Date(Date.now() + safeSeconds * 1000).toISOString()
}

function isUsableExpiresAt(expiresAt: string | null) {
  if (!expiresAt) return false
  const time = new Date(expiresAt).getTime()
  return Number.isFinite(time) && time - Date.now() > TOKEN_REFRESH_BUFFER_MS
}

async function storeToken(
  user: { id: string },
  body: Record<string, unknown>,
) {
  const accessToken =
    typeof body.providerAccessToken === 'string'
      ? body.providerAccessToken.trim()
      : ''
  const refreshToken =
    typeof body.providerRefreshToken === 'string'
      ? body.providerRefreshToken.trim()
      : ''
  const scopes = typeof body.scopes === 'string' ? body.scopes : null

  if (!accessToken) {
    return jsonResponse({ error: 'Spotify access token is required' }, 400)
  }

  const supabase = adminClient()
  const { data: existing, error: existingError } = await supabase
    .from('SpotifyOAuthTokens')
    .select('refresh_token_ciphertext, refresh_token_iv')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (existingError) {
    return jsonResponse({ error: existingError.message }, 500)
  }

  const encryptedAccessToken = await encryptSecret(accessToken)
  const tokenPayload: Record<string, unknown> = {
    auth_user_id: user.id,
    access_token_ciphertext: encryptedAccessToken.ciphertext,
    access_token_iv: encryptedAccessToken.iv,
    token_type: 'Bearer',
    scopes,
    expires_at: tokenExpiresAt(body.expiresIn),
    updated_at: new Date().toISOString(),
    last_error: null,
  }

  if (refreshToken) {
    const encryptedRefreshToken = await encryptSecret(refreshToken)
    tokenPayload.refresh_token_ciphertext = encryptedRefreshToken.ciphertext
    tokenPayload.refresh_token_iv = encryptedRefreshToken.iv
  } else if (existing?.refresh_token_ciphertext && existing?.refresh_token_iv) {
    tokenPayload.refresh_token_ciphertext = existing.refresh_token_ciphertext
    tokenPayload.refresh_token_iv = existing.refresh_token_iv
  } else {
    tokenPayload.refresh_token_ciphertext = null
    tokenPayload.refresh_token_iv = null
  }

  const { error } = await supabase
    .from('SpotifyOAuthTokens')
    .upsert(tokenPayload, { onConflict: 'auth_user_id' })

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({
    accessToken,
    expiresAt: tokenPayload.expires_at,
    hasRefreshToken: Boolean(tokenPayload.refresh_token_ciphertext),
  })
}

async function refreshSpotifyAccessToken(row: SpotifyTokenRow) {
  if (!row.refresh_token_ciphertext || !row.refresh_token_iv) {
    return {
      error: 'Spotify 재인증이 필요합니다.',
      status: 409,
    }
  }

  const refreshToken = await decryptSecret(
    row.refresh_token_ciphertext,
    row.refresh_token_iv,
  )
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID')
  const clientSecret = requiredEnv('SPOTIFY_CLIENT_SECRET')
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const responseText = await response.text()
  let tokenData: Record<string, unknown> = {}
  try {
    tokenData = responseText ? JSON.parse(responseText) : {}
  } catch {
    tokenData = {}
  }

  if (!response.ok || typeof tokenData.access_token !== 'string') {
    return {
      error:
        typeof tokenData.error_description === 'string'
          ? tokenData.error_description
          : 'Spotify access token refresh failed',
      status: response.status || 502,
    }
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken:
      typeof tokenData.refresh_token === 'string'
        ? tokenData.refresh_token
        : '',
    expiresAt: tokenExpiresAt(tokenData.expires_in),
    scopes: typeof tokenData.scope === 'string' ? tokenData.scope : row.scopes,
  }
}

async function getToken(userId: string, body: Record<string, unknown>) {
  const forceRefresh = body.forceRefresh === true
  const supabase = adminClient()
  const { data: row, error } = await supabase
    .from('SpotifyOAuthTokens')
    .select(
      'auth_user_id, access_token_ciphertext, access_token_iv, refresh_token_ciphertext, refresh_token_iv, token_type, scopes, expires_at',
    )
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  const tokenRow = row as SpotifyTokenRow | null

  if (!tokenRow) {
    return jsonResponse({ error: 'Spotify token is not stored' }, 404)
  }

  if (!forceRefresh && isUsableExpiresAt(tokenRow.expires_at)) {
    return jsonResponse({
      accessToken: await decryptSecret(
        tokenRow.access_token_ciphertext,
        tokenRow.access_token_iv,
      ),
      expiresAt: tokenRow.expires_at,
      hasRefreshToken: Boolean(tokenRow.refresh_token_ciphertext),
    })
  }

  const refreshed = await refreshSpotifyAccessToken(tokenRow)
  if ('error' in refreshed) {
    await supabase
      .from('SpotifyOAuthTokens')
      .update({
        last_error: refreshed.error,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', userId)

    return jsonResponse(
      { error: refreshed.error, code: 'spotify_reauth_required' },
      refreshed.status,
    )
  }

  const encryptedAccessToken = await encryptSecret(refreshed.accessToken)
  const updatePayload: Record<string, unknown> = {
    access_token_ciphertext: encryptedAccessToken.ciphertext,
    access_token_iv: encryptedAccessToken.iv,
    scopes: refreshed.scopes,
    expires_at: refreshed.expiresAt,
    last_refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null,
  }

  if (refreshed.refreshToken) {
    const encryptedRefreshToken = await encryptSecret(refreshed.refreshToken)
    updatePayload.refresh_token_ciphertext = encryptedRefreshToken.ciphertext
    updatePayload.refresh_token_iv = encryptedRefreshToken.iv
  }

  const { error: updateError } = await supabase
    .from('SpotifyOAuthTokens')
    .update(updatePayload)
    .eq('auth_user_id', userId)

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500)
  }

  return jsonResponse({
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    hasRefreshToken: Boolean(
      refreshed.refreshToken || tokenRow.refresh_token_ciphertext,
    ),
  })
}

async function deleteToken(userId: string) {
  const { error } = await adminClient()
    .from('SpotifyOAuthTokens')
    .delete()
    .eq('auth_user_id', userId)

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ ok: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { user, error } = await getAuthUser(req)
    if (error || !user) {
      return jsonResponse({ error: error || 'Authenticated user not found' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'get'

    if (action === 'store') return await storeToken(user, body)
    if (action === 'delete') return await deleteToken(user.id)
    return await getToken(user.id, body)
  } catch (error) {
    console.error('spotify-token error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return jsonResponse({ error: message }, 500)
  }
})
