import { Link, useLocation, useNavigate } from "react-router-dom";
import { MAP_RECENTER_USER_EVENT } from "../constants/appEvents";
import "./BottomNav.css";

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  
  const onHome = pathname === "/home" || pathname.startsWith("/home/");
  const onMap = pathname === "/map" || pathname.startsWith("/map/");
  const onTrending = pathname.startsWith("/trending");
  const onMyPage = pathname.startsWith("/mypage");

  const homeSrc = onHome ? "/house.fill.svg" : "/house.svg";
  const mapSrc = onMap ? "/map.fill.svg" : "/map.svg";
  const profileSrc = onMyPage ? "/person.fill.svg" : "/person.svg";

  const active = onHome ? "home" : onMap ? "map" : onTrending ? "trending" : onMyPage ? "profile" : "none";

  return (
    <>
      <nav className="bottom-nav" aria-label="하단 메뉴" data-active={active}>
        <span className="bottom-nav__active-ring" aria-hidden />
        
        <span className="bottom-nav__item">
          <button
            type="button"
            className="bottom-nav__btn"
            onClick={() => navigate("/home")}
            aria-label="홈"
            aria-current={onHome ? "page" : undefined}
          >
            <img className="bottom-nav__icon bottom-nav__icon--home" src={homeSrc} alt="" aria-hidden />
          </button>
        </span>
        
        <span className="bottom-nav__item">
          <button
            type="button"
            className="bottom-nav__btn"
            onClick={() => {
              if (onMap) {
                window.dispatchEvent(new CustomEvent(MAP_RECENTER_USER_EVENT));
              } else {
                navigate("/map");
              }
            }}
            aria-label="지도"
            aria-current={onMap ? "page" : undefined}
          >
            <img className="bottom-nav__icon bottom-nav__icon--map" src={mapSrc} alt="" aria-hidden />
          </button>
        </span>

        <span className="bottom-nav__item">
          <button
            type="button"
            className="bottom-nav__btn"
            onClick={() => navigate("/trending")}
            aria-label="트렌딩"
            aria-current={onTrending ? "page" : undefined}
          >
            <svg 
              width="23" 
              height="23" 
              viewBox="0 0 24 24" 
              fill={onTrending ? "#FFFFFF" : "none"} 
              stroke={onTrending ? "#FFFFFF" : "#A9AFB9"} 
              strokeWidth="1.5" 
              strokeLinejoin="round" 
              className="bottom-nav__icon bottom-nav__icon--trending"
            >
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
            </svg>
          </button>
        </span>

        <span className="bottom-nav__item">
          <Link
            to="/mypage"
            className="bottom-nav__link"
            aria-label="마이페이지"
            aria-current={onMyPage ? "page" : undefined}
          >
            <img className="bottom-nav__icon bottom-nav__icon--profile" src={profileSrc} alt="" aria-hidden />
          </Link>
        </span>
      </nav>

      <button 
        type="button" 
        className="bottom-nav__fab" 
        aria-label="작성"
        onClick={() => navigate("/upload")}
      >
        +
      </button>
    </>
  );
}