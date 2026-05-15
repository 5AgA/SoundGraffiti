export function getCommentSheetPeekHeightPx(fromFlipView = false) {
  if (typeof window === "undefined") return fromFlipView ? 360 : 520;
  if (fromFlipView) {
    return Math.min(400, Math.round(window.innerHeight * 0.405));
  }
  return Math.min(520, Math.round(window.innerHeight * 0.58));
}

export function getCommentSheetExpandedHeightPx() {
  if (typeof window === "undefined") return 640;
  const vh = window.innerHeight;
  return Math.min(Math.round(vh * 0.92), vh - 12);
}

export function getCommentSheetPeekMinShrinkPx(peekH) {
  return Math.max(152, Math.round(peekH * 0.34));
}
