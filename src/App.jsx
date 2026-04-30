import { useEffect, useState } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { getFeed } from "./api/posts";
import HomeBlurV1 from "./components/HomeBlurV1";

function App() {
  const [feed, setFeed] = useState([]);

  const handleGetFeed = async () => {
    const result = await getFeed();
    setFeed(result || []);
  };

  useEffect(() => {
    handleGetFeed();
  }, []);

  return (
    <AuthProvider>
      <HomeBlurV1 feed={feed} />
    </AuthProvider>
  );
}

export default App;
