import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // check current session when the app is loaded
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // update session upon login or logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    // unsubscribe when component is unmounted
    return () => subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    // where to retrieve spotify access token for API calls
    spotifyToken: session?.provider_token ?? null,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  // TEMP: 인증 플로우 작업 중에는 컨텍스트가 없더라도 화면이 깨지지 않게 기본값 반환
  if (!context) {
    return {
      session: null,
      user: null,
      spotifyToken: null,
      loading: false,
    }
  }
  return context
}