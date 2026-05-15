function dayPartKo(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "아침";
  if (hour >= 12 && hour < 17) return "점심";
  return "저녁";
}

/** 게시 시각 → "3시간 전 점심", "2일 전 아침", "2025. 5. 10. 저녁" */
export function formatPostDateTimeKo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const part = dayPartKo(d);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) {
    return `${d.toLocaleDateString("ko-KR")} ${part}`;
  }

  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day < 1) {
    if (hr >= 1) return `${hr}시간 전 ${part}`;
    if (min >= 1) return `${min}분 전 ${part}`;
    return `방금 전 ${part}`;
  }
  if (day < 7) {
    return `${day}일 전 ${part}`;
  }

  return `${d.toLocaleDateString("ko-KR")} ${part}`;
}
