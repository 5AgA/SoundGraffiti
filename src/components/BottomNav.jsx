import { Link, useLocation, useNavigate } from "react-router-dom";
import "./BottomNav.css";

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onHome =
    pathname === "/home" || pathname.startsWith("/home/");
  const onMyPage = pathname.startsWith("/mypage");

  const homeSrc = onHome ? "/house.fill.svg" : "/house.svg";
  const profileSrc = onMyPage ? "/person.fill.svg" : "/person.svg";

  const active =
    onHome ? "home" : onMyPage ? "profile" : "none";

  return (
    <>
      <nav
        className="bottom-nav"
        aria-label="하단 메뉴"
        data-active={active}
      >
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
          <img
            className="bottom-nav__icon bottom-nav__icon--map"
            src="/map.svg"
            alt="Map"
          />
        </span>
        <span className="bottom-nav__item">
          <Link to="/mypage" className="bottom-nav__link">
            <img
              className="bottom-nav__icon bottom-nav__icon--profile"
              src={profileSrc}
              alt="Profile"
            />
          </Link>
        </span>
      </nav>
      <button type="button" className="bottom-nav__fab" aria-label="작성">
        +
      </button>
    </>
  );
}
