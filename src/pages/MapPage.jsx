import { useSearchParams } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import KakaoMap from "../KakaoMap";

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const placeId = searchParams.get("placeId");

  return (
    <>
      <KakaoMap initialPlaceId={placeId} />
      <BottomNav />
    </>
  );
}