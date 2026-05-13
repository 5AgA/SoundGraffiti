import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCommentSheetExpandedHeightPx,
  getCommentSheetPeekHeightPx,
  getCommentSheetPeekMinShrinkPx,
} from "../utils/commentSheetMetrics";

/**
 * 홈·마이페이지 댓글 바텀시트 — 핸들 드래그로 peek ↔ 확장 ↔ 닫기
 * @param {{
 *   fromFlipView: boolean,
 *   isActive: boolean,
 *   layoutResetKey?: string | number | null,
 *   onDismiss: () => void,
 * }} opts
 */
export function useCommentSheetDrag({
  fromFlipView,
  isActive,
  layoutResetKey = null,
  onDismiss,
}) {
  const sheetRef = useRef(null);
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startY: 0,
    startTranslate: 0,
    lastOffset: 0,
    lastClientY: 0,
    bestDy: 0,
    minClientY: 0,
    lastStretchDown: 0,
    expandDragStartHeight: null,
  });
  const sheetTranslateYRef = useRef(0);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetExpandedRef = useRef(false);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [sheetInteractiveHeightPx, setSheetInteractiveHeightPx] =
    useState(null);
  const sheetInteractiveHeightPxRef = useRef(null);
  const prevLayoutKeyRef = useRef(null);

  useEffect(() => {
    sheetTranslateYRef.current = sheetTranslateY;
  }, [sheetTranslateY]);

  useEffect(() => {
    sheetExpandedRef.current = sheetExpanded;
  }, [sheetExpanded]);

  useEffect(() => {
    sheetInteractiveHeightPxRef.current = sheetInteractiveHeightPx;
  }, [sheetInteractiveHeightPx]);

  const resetSheetLayout = useCallback(() => {
    setSheetTranslateY(0);
    setSheetDragging(false);
    setSheetExpanded(false);
    setSheetInteractiveHeightPx(null);
    dragRef.current.active = false;
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!isActive) {
        prevLayoutKeyRef.current = null;
        resetSheetLayout();
        return;
      }
      const key = layoutResetKey;
      if (
        key != null &&
        prevLayoutKeyRef.current != null &&
        prevLayoutKeyRef.current !== key
      ) {
        resetSheetLayout();
      }
      prevLayoutKeyRef.current = key ?? null;
    });
    return () => cancelAnimationFrame(id);
  }, [isActive, layoutResetKey, resetSheetLayout]);

  const onHandlePointerDown = useCallback(
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const d = dragRef.current;
      d.active = true;
      d.pointerId = e.pointerId;
      d.startY = e.clientY;
      d.lastClientY = e.clientY;
      d.minClientY = e.clientY;
      d.bestDy = 0;
      d.lastStretchDown = 0;
      d.expandDragStartHeight = sheetExpandedRef.current
        ? (sheetRef.current?.offsetHeight ?? getCommentSheetExpandedHeightPx())
        : null;
      d.startTranslate = sheetTranslateYRef.current;
      d.lastOffset = sheetTranslateYRef.current;
      setSheetInteractiveHeightPx(null);
      setSheetDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onHandlePointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      d.lastClientY = e.clientY;

      if (sheetExpandedRef.current) {
        if (dy <= 0) {
          setSheetInteractiveHeightPx(null);
          setSheetTranslateY(0);
          d.lastOffset = 0;
          d.lastStretchDown = 0;
          return;
        }
        const stretchDown = dy;
        d.lastStretchDown = stretchDown;
        const exp =
          d.expandDragStartHeight ?? getCommentSheetExpandedHeightPx();
        const peek = getCommentSheetPeekHeightPx(fromFlipView);
        const shrunk = Math.max(peek, Math.round(exp - stretchDown));
        const overflowDown = Math.max(0, stretchDown - (exp - peek));
        setSheetInteractiveHeightPx(shrunk);
        setSheetTranslateY(overflowDown);
        d.lastOffset = overflowDown;
        return;
      }

      d.bestDy = Math.min(d.bestDy, dy);
      d.minClientY = Math.min(d.minClientY ?? e.clientY, e.clientY);

      if (e.clientY >= d.startY) {
        const stretchDown = e.clientY - d.startY;
        d.lastStretchDown = stretchDown;
        const peek = getCommentSheetPeekHeightPx(fromFlipView);
        const minH = getCommentSheetPeekMinShrinkPx(peek);
        const shrunk = Math.max(minH, peek - stretchDown);
        const overflowDown = Math.max(0, stretchDown - (peek - minH));
        setSheetInteractiveHeightPx(Math.round(shrunk));
        setSheetTranslateY(overflowDown);
        d.lastOffset = overflowDown;
        return;
      }

      d.lastStretchDown = 0;
      setSheetTranslateY(0);
      d.lastOffset = 0;
      const stretchPx = Math.max(0, d.startY - d.minClientY);
      const peek = getCommentSheetPeekHeightPx(fromFlipView);
      const exp = getCommentSheetExpandedHeightPx();
      const h = Math.min(peek + stretchPx, exp);
      setSheetInteractiveHeightPx(Math.round(h));
    },
    [fromFlipView],
  );

  const endDrag = useCallback(
    (target, pointerId) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== pointerId) return;
      d.active = false;
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }

      const expanded = sheetExpandedRef.current;
      const offset = d.lastOffset ?? sheetTranslateYRef.current;
      const totalDy = d.lastClientY - d.startY;
      const upwardIntent = Math.min(totalDy, d.bestDy);

      setSheetDragging(false);

      const draggedHeightSnap = sheetInteractiveHeightPxRef.current;

      if (!expanded) {
        const minCy = d.minClientY ?? d.startY;
        const releaseStretch = Math.max(0, d.startY - minCy);
        const peek = getCommentSheetPeekHeightPx(fromFlipView);
        const exp = getCommentSheetExpandedHeightPx();
        const expandThresholdPx = Math.max(56, Math.round((exp - peek) * 0.22));

        const sheetH = sheetRef.current?.offsetHeight ?? 320;
        const dismissPeek = Math.min(112, sheetH * 0.28);

        setSheetInteractiveHeightPx(null);

        if (offset >= dismissPeek) {
          onDismiss();
          return;
        }
        if (
          upwardIntent < -36 ||
          releaseStretch >= expandThresholdPx ||
          (draggedHeightSnap != null &&
            draggedHeightSnap >= peek + (exp - peek) * 0.85)
        ) {
          setSheetExpanded(true);
          requestAnimationFrame(() => setSheetTranslateY(0));
          return;
        }
        requestAnimationFrame(() => setSheetTranslateY(0));
        return;
      }

      const peek = getCommentSheetPeekHeightPx(fromFlipView);
      const exp = d.expandDragStartHeight ?? getCommentSheetExpandedHeightPx();
      const shrinkProgress =
        exp > peek && draggedHeightSnap != null
          ? (exp - draggedHeightSnap) / (exp - peek)
          : 0;

      const collapseExpandedPx = 40;
      const dismissExpandedPx =
        typeof window !== "undefined"
          ? Math.min(340, Math.round(window.innerHeight * 0.42))
          : 300;

      setSheetInteractiveHeightPx(null);

      if (offset >= dismissExpandedPx) {
        onDismiss();
        return;
      }
      if (
        offset >= collapseExpandedPx ||
        shrinkProgress >= 0.42 ||
        (draggedHeightSnap != null && draggedHeightSnap <= peek + 40)
      ) {
        setSheetExpanded(false);
        requestAnimationFrame(() => setSheetTranslateY(0));
        return;
      }

      requestAnimationFrame(() => setSheetTranslateY(0));
    },
    [fromFlipView, onDismiss],
  );

  const onHandlePointerUp = useCallback(
    (e) => {
      endDrag(e.currentTarget, e.pointerId);
    },
    [endDrag],
  );

  const onHandlePointerCancel = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setSheetDragging(false);
    setSheetInteractiveHeightPx(null);
    requestAnimationFrame(() => setSheetTranslateY(0));
  }, []);

  const sheetStyle = {
    transform: `translateY(${sheetTranslateY}px)`,
    ...(sheetInteractiveHeightPx != null
      ? {
          height: `${sheetInteractiveHeightPx}px`,
          maxHeight: `${sheetInteractiveHeightPx}px`,
          "--comment-sheet-h": `${sheetInteractiveHeightPx}px`,
        }
      : {}),
  };

  return {
    sheetRef,
    sheetDragging,
    sheetExpanded,
    sheetStyle,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
    resetSheetLayout,
  };
}
