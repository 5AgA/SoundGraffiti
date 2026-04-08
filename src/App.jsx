import { AuthProvider } from './contexts/AuthContext';
import UserStatus from './components/UserStatus';
import KakaoMap from "./KakaoMap";

function App() {
  return (
    <AuthProvider>
        <div>
            <UserStatus />
            <h1>지도 테스트</h1>
            <KakaoMap />
        </div>
    </AuthProvider>
  );
}

export default App;