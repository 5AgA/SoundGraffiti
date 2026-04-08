import { supabase } from '../supabaseClient'

export default function Login() {
    const handleSpotifyLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'spotify',
            options: {
                scopes: 'user-read-email user-read-private streaming user-modify-playback-state user-read-playback-state',
                redirectTo: `${window.location.origin}/`,
            },
        })
        if (error) {
            console.error('Spotify 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`,
            },
        })
        if (error) {
            console.error('Google 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    const handleKakaoLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: `${window.location.origin}/`,
            },
        })
        if (error) {
            console.error('Kakao 로그인 실패:', error.message)
            alert('로그인에 실패했습니다: ' + error.message)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

            <button
                onClick={handleGoogleLogin}
                style={{
                    padding: '12px 24px',
                    backgroundColor: '#fff',
                    color: '#444',
                    border: '1px solid #ddd',
                    borderRadius: '24px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}
            >
                Google로 로그인
            </button>

            <button
                onClick={handleKakaoLogin}
                style={{
                    padding: '12px 24px',
                    backgroundColor: '#FEE500',
                    color: '#000',
                    border: 'none',
                    borderRadius: '24px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}
            >
                카카오로 로그인
            </button>
        </div>
    )
}