import { supabase } from '../supabaseClient'

export default function Login() {
  const handleSpotifyLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        // For Spotify API
        scopes: 'user-read-email user-read-private streaming user-modify-playback-state user-read-playback-state',
        // URL to return to when login succeeds
        redirectTo: `${window.location.origin}/`,
      },
    })

    if (error) {
      console.error('Spotify 로그인 실패:', error.message)
      alert('로그인에 실패했습니다: ' + error.message)
    }
  }

  return (
    <button
      onClick={handleSpotifyLogin}
      style={{
        padding: '12px 24px',
        backgroundColor: '#1DB954',
        color: 'white',
        border: 'none',
        borderRadius: '24px',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
      }}
    >
      Spotify로 로그인
    </button>
  )
}