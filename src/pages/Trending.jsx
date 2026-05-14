import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import BottomNav from '../components/BottomNav';
import './Trending.css';

function Trending() {
  const navigate = useNavigate();
  const [spots, setSpots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTrendingSpots = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-trending-spots');
        if (error) throw error;
        if (data && data.data) {
          setSpots(data.data);
        }
      } catch (err) {
        console.error("트렌딩 스팟 에러:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrendingSpots();
  }, []);

  const formatAddress = (address) => {
    if (!address) return '';
    return address.split(' ').slice(0, 2).join(' ');
  };

  return (
    <div className="trending-screen">
      <header className="trending-header">
        <h1 className="trending-title">TRENDING SPOTS</h1>
      </header>
      <div className="trending-inner">
        
        <div className="trending-content">
          {isLoading ? (
            <div className="trending-loading">데이터를 불러오는 중...</div>
          ) : spots.length === 0 ? (
            <div className="trending-empty">아직 등록된 그래피티가 없습니다.</div>
          ) : (
            <>
              {/* 💡 1위 카드 */}
              <div 
                className="trending-card top-card" 
                onClick={() => navigate(`/map?placeId=${spots[0].place_id}`)}
              >
                {/* 🚨 절대 안 겹치게 Flexbox로 묶은 헤더 */}
                <div className="trending-card-header">
                  <div className="trending-rank">
                    <span className="trending-hash">#</span>1
                  </div>
                  <div className="trending-info">
                    <div className="trending-name">{spots[0].place_name}</div>
                    <div className="trending-address">{formatAddress(spots[0].address_name)}</div>
                  </div>
                </div>
                
                <div className="trending-badge">
                  <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.77518 13C1.18345 13 0.739659 12.8485 0.443796 12.5455C0.147932 12.2465 0 11.7981 0 11.2001V5.18445C0 4.59046 0.147932 4.14397 0.443796 3.84499C0.739659 3.54201 1.18345 3.39052 1.77518 3.39052H10.2248C10.8127 3.39052 11.2545 3.54201 11.5504 3.84499C11.8501 4.14397 12 4.59046 12 5.18445V11.2001C12 11.7941 11.8501 12.2426 11.5504 12.5455C11.2545 12.8485 10.8127 13 10.2248 13H1.77518ZM1.11533 2.42778C1.15815 2.1567 1.24963 1.9494 1.38978 1.80589C1.52993 1.65839 1.74599 1.58464 2.03796 1.58464H9.96788C10.2599 1.58464 10.474 1.65839 10.6102 1.80589C10.7504 1.9494 10.8438 2.1567 10.8905 2.42778H1.11533ZM2.31825 0.771389C2.33382 0.516253 2.41168 0.3249 2.55182 0.197332C2.69586 0.0657774 2.90219 0 3.1708 0H8.8292C9.1017 0 9.30803 0.0657774 9.44818 0.197332C9.58832 0.3249 9.66813 0.516253 9.68759 0.771389H2.31825Z" fill="white"/>
                  </svg>
                  <span>{spots[0].post_count}</span>
                </div>
                <div className="trending-top-deco"></div>
              </div>

              {/* 💡 2~11위 카드 */}
              <div className="trending-grid">
                {spots.slice(1).map((spot, index) => (
                  <div 
                    key={spot.place_id} 
                    className="trending-card normal-card"
                    onClick={() => navigate(`/map?placeId=${spot.place_id}`)}
                  >
                    {/* 🚨 절대 안 겹치게 Flexbox로 묶은 헤더 */}
                    <div className="trending-card-header">
                      <div className="trending-rank">
                        <span className="trending-hash">#</span>{index + 2}
                      </div>
                      <div className="trending-info">
                        <div className="trending-name">{spot.place_name}</div>
                        <div className="trending-address">{formatAddress(spot.address_name)}</div>
                      </div>
                    </div>

                    <div className="trending-badge">
                      <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1.77518 13C1.18345 13 0.739659 12.8485 0.443796 12.5455C0.147932 12.2465 0 11.7981 0 11.2001V5.18445C0 4.59046 0.147932 4.14397 0.443796 3.84499C0.739659 3.54201 1.18345 3.39052 1.77518 3.39052H10.2248C10.8127 3.39052 11.2545 3.54201 11.5504 3.84499C11.8501 4.14397 12 4.59046 12 5.18445V11.2001C12 11.7941 11.8501 12.2426 11.5504 12.5455C11.2545 12.8485 10.8127 13 10.2248 13H1.77518ZM1.11533 2.42778C1.15815 2.1567 1.24963 1.9494 1.38978 1.80589C1.52993 1.65839 1.74599 1.58464 2.03796 1.58464H9.96788C10.2599 1.58464 10.474 1.65839 10.6102 1.80589C10.7504 1.9494 10.8438 2.1567 10.8905 2.42778H1.11533ZM2.31825 0.771389C2.33382 0.516253 2.41168 0.3249 2.55182 0.197332C2.69586 0.0657774 2.90219 0 3.1708 0H8.8292C9.1017 0 9.30803 0.0657774 9.44818 0.197332C9.58832 0.3249 9.66813 0.516253 9.68759 0.771389H2.31825Z" fill="white"/>
                      </svg>
                      <span>{spot.post_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

export default Trending;