import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabaseClient'
import Login from './Login'

export default function UserStatus() {
  const { user, loading } = useAuth()

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('로그아웃 실패:', error.message)
    }
  }

  if (loading) {
    return <div>로딩 중..</div>
  }

  if (!user) {
    return <Login />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span>환영합니다, {user.user_metadata?.name || user.email}님</span>
      <button onClick={handleLogout}>로그아웃</button>
    </div>
  )
}