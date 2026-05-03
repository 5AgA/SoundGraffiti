import { AuthProvider } from './contexts/AuthContext';
import UserStatus from './components/UserStatus';
import SpotifyTestPlayer from './components/SpotifyTestPlayer';
import KakaoMap from "./KakaoMap";

function App() {
  return (
    <AuthProvider>
        <div>
            <UserStatus />
            <SpotifyTestPlayer />
            <h1>지도 테스트</h1>
            <KakaoMap />
        </div>
    </AuthProvider>
  );
}

export default App;
