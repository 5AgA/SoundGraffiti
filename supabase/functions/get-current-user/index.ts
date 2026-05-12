import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function authDisplayName(authUser: {
  email?: string
  user_metadata?: Record<string, unknown>
}) {
  const metadata = authUser.user_metadata ?? {}
  const value =
    metadata.user_name ??
    metadata.full_name ??
    metadata.name ??
    metadata.preferred_username

  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof authUser.email === 'string' && authUser.email.includes('@')) {
    return authUser.email.split('@')[0]
  }
  return '사용자'
}

function authProfileUrl(authUser: { user_metadata?: Record<string, unknown> }) {
  const metadata = authUser.user_metadata ?? {}
  const value =
    metadata.user_profile_url ??
    metadata.avatar_url ??
    metadata.picture

  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization header is required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  )

  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser?.email) {
    return new Response(
      JSON.stringify({ error: authError?.message ?? 'Authenticated user not found' }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date().toISOString()
  const displayName = authDisplayName(authUser)
  const profileUrl = authProfileUrl(authUser)

  const { data: linkedUser, error: linkedError } = await adminClient
    .from('Users')
    .select('user_id, user_email, user_name, user_profile_url, auth_user_id')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (linkedError) {
    return new Response(JSON.stringify({ error: linkedError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let appUser = linkedUser

  if (!appUser) {
    const { data: emailUser, error: emailError } = await adminClient
      .from('Users')
      .select('user_id, user_email, user_name, user_profile_url, auth_user_id')
      .eq('user_email', authUser.email)
      .maybeSingle()

    if (emailError) {
      return new Response(JSON.stringify({ error: emailError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (emailUser) {
      const { data: updatedUser, error: updateError } = await adminClient
        .from('Users')
        .update({
          auth_user_id: authUser.id,
          last_login: now,
          user_updated: now,
        })
        .eq('user_id', emailUser.user_id)
        .select('user_id, user_email, user_name, user_profile_url, auth_user_id')
        .single()

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      appUser = updatedUser
    }
  }

  if (!appUser) {
    const { data: createdUser, error: createError } = await adminClient
      .from('Users')
      .insert({
        auth_user_id: authUser.id,
        user_email: authUser.email,
        user_name: displayName,
        user_profile_url: profileUrl || null,
        user_password: '',
        user_created: now,
        last_login: now,
      })
      .select('user_id, user_email, user_name, user_profile_url, auth_user_id')
      .single()

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    appUser = createdUser
  }

  return new Response(
    JSON.stringify({
      user: appUser,
      auth: {
        id: authUser.id,
        email: authUser.email,
      },
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
