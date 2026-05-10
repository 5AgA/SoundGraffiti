import { Link, useLocation, useNavigate } from "react-router-dom";
import "./BottomNav.css";

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  
  const onHome = pathname === "/home" || pathname.startsWith("/home/");
  const onMap = pathname === "/map" || pathname.startsWith("/map/");
  const onMyPage = pathname.startsWith("/mypage");

  const homeSrc = onHome ? "/house.fill.svg" : "/house.svg";
  const mapSrc = onMap ? "/map.fill.svg" : "/map.svg";
  const profileSrc = onMyPage ? "/person.fill.svg" : "/person.svg";

  const active = onHome ? "home" : onMap ? "map" : onMyPage ? "profile" : "none";

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
            <img
              className="bottom-nav__icon bottom-nav__icon--home"
              src={homeSrc}
              alt=""
              aria-hidden
            />
          </button>
        </span>
        <span className="bottom-nav__item">
          <button
            type="button"
            className="bottom-nav__btn"
            onClick={() => navigate("/map")}
            aria-label="지도"
            aria-current={onMap ? "page" : undefined}
          >
            <img
              className="bottom-nav__icon bottom-nav__icon--map"
              src={mapSrc}
              alt=""
              aria-hidden
            />
          </button>
        </span>
        <span className="bottom-nav__item">
          <Link
            to="/mypage"
            className="bottom-nav__link"
            aria-label="마이페이지"
            aria-current={onMyPage ? "page" : undefined}
          >
            <img
              className="bottom-nav__icon bottom-nav__icon--profile"
              src={profileSrc}
              alt=""
              aria-hidden
            />
          </Link>
        </span>
      </nav>

      {/* 💡 플러스(FAB) 버튼 클릭 시 /upload 경로로 이동! */}
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