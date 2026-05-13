import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createComment, deleteComment } from "../api/comments";
import { useCommentSheetDrag } from "../hooks/useCommentSheetDrag";
import {
  DEFAULT_PROFILE_IMAGE,
  resolvedProfileImageUrl,
} from "../utils/profileImage";

/** 루트=0 … 깊이 2까지 스레드 — 그보다 깊은 댓글에는 답글 달기 비활성 (Home.jsx 와 동일) */
const MAX_COMMENT_REPLY_DEPTH = 2;
const COMMENT_LONG_PRESS_MS = 580;
const COMMENT_LONG_PRESS_MOVE_SQ = 1200;

/** @param {Record<string, unknown>} post */
function commentsFromPost(post) {
  const raw = post?.Comments ?? post?.comments;
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(
    (row) => row != null && row.comment_deleted == null,
  );
}

/** @param {Record<string, unknown>} row */
function commentUserFromRow(row) {
  const raw = row?.Users ?? row?.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  return u != null && typeof u === "object" ? u : {};
}

/** 행에 직접 없으면 중첩 Users.user_id (Home.jsx 와 동일) */
function commentAuthorUserId(row) {
  if (row == null) return null;
  if (row.user_id != null) return row.user_id;
  const u = commentUserFromRow(row);
  return u?.user_id ?? null;
}

function isOwnSheetComment(row, viewerUserId) {
  const cid = commentAuthorUserId(row);
  if (cid == null || viewerUserId == null) return false;
  return String(cid) === String(viewerUserId);
}

/** DB·조회 형태 차이 대비 */
function commentBodyFromRow(row) {
  if (row == null || typeof row !== "object") return "";
  const c = row.content ?? row.comment_content;
  return typeof c === "string" ? c : "";
}

function sheetCommentsSorted(rows) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.comment_created ?? 0).getTime();
    const tb = new Date(b.comment_created ?? 0).getTime();
    return ta - tb;
  });
}

/** parent_comment_id 기준 트리 순회(선주 후손) — Home.jsx 와 동일 */
function orderedCommentsWithDepth(rows) {
  const valid = rows.filter((r) => r != null && r.comment_id != null);
  const byId = new Map(valid.map((r) => [String(r.comment_id), r]));
  const children = new Map();
  for (const r of valid) {
    const pid = r.parent_comment_id;
    if (pid == null) continue;
    const key = String(pid);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(r);
  }
  for (const list of children.values()) {
    list.sort(
      (a, b) =>
        new Date(a.comment_created ?? 0).getTime() -
        new Date(b.comment_created ?? 0).getTime(),
    );
  }
  const roots = valid
    .filter((r) => {
      if (r.parent_comment_id == null) return true;
      return !byId.has(String(r.parent_comment_id));
    })
    .sort(
      (a, b) =>
        new Date(a.comment_created ?? 0).getTime() -
        new Date(b.comment_created ?? 0).getTime(),
    );

  const out = [];
  function walk(node, depth) {
    out.push({ row: node, depth });
    const kids = children.get(String(node.comment_id)) ?? [];
    for (const k of kids) walk(k, depth + 1);
  }
  for (const root of roots) walk(root, 0);
  return out;
}

function formatSheetCommentTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/**
 * 마이페이지 플립 모달용 댓글 시트 (홈 `home-comment-*` 스타일·핸들 드래그 재사용)
 * @param {{
 *   open: boolean,
 *   post: Record<string, unknown> | null,
 *   appUserId: number | null,
 *   meProfileRaw: string,
 *   displayName: string,
 *   accessPending: boolean,
 *   accessReady: boolean,
 *   onClose: () => void,
 *   onCommentCreated: (row: Record<string, unknown>) => void,
 *   onCommentDeleted?: (commentId: string | number) => void,
 * }} props
 */
export default function MyPageFlipCommentSheet({
  open,
  post,
  appUserId,
  meProfileRaw,
  displayName,
  accessPending,
  accessReady,
  onClose,
  onCommentCreated,
  onCommentDeleted,
}) {
  const commentScrollRef = useRef(null);
  const sheetDrag = useCommentSheetDrag({
    fromFlipView: true,
    isActive: Boolean(open && post),
    layoutResetKey: post?.post_id ?? null,
    onDismiss: onClose,
  });

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState(
    /** @type {{ id: unknown, name: string } | null} */ (null),
  );
  const [commentDeletePrompt, setCommentDeletePrompt] = useState(
    /** @type {{ commentId: unknown } | null} */ (null),
  );
  const [commentDeleteSubmitting, setCommentDeleteSubmitting] =
    useState(false);
  const commentLongPressRef = useRef({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

  const flushCommentLongPressTimer = useCallback(() => {
    const lp = commentLongPressRef.current;
    if (lp.timer != null) window.clearTimeout(lp.timer);
    lp.timer = null;
    lp.pointerId = null;
  }, []);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setReplyTarget(null);
      flushCommentLongPressTimer();
      setCommentDeletePrompt(null);
    }
  }, [open, post?.post_id, flushCommentLongPressTimer]);

  const thread = useMemo(() => {
    if (!post) return [];
    return orderedCommentsWithDepth(sheetCommentsSorted(commentsFromPost(post)));
  }, [post]);

  useEffect(() => {
    if (!open || !post || accessPending || !accessReady) return;
    const el = commentScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, post, accessPending, accessReady, thread.length]);

  const composerAvatar = resolvedProfileImageUrl(meProfileRaw);

  const submit = useCallback(async () => {
    const baseText = draft.trim();
    const postId = post?.post_id;
    if (!baseText || postId == null || submitting) return;
    if (appUserId == null) {
      alert(
        "로그인 사용자 정보를 확인할 수 없어 댓글을 저장할 수 없습니다. 다시 로그인해 주세요.",
      );
      return;
    }
    const parentCommentId = replyTarget?.id;
    let contentToSend = baseText;
    if (parentCommentId != null && replyTarget?.name) {
      const atName = String(replyTarget.name).trim() || "사용자";
      contentToSend = `@${atName} ${baseText}`;
    }
    setSubmitting(true);
    try {
      const res = await createComment({
        postId,
        userId: appUserId,
        content: contentToSend,
        ...(parentCommentId != null ? { parentCommentId } : {}),
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      const created =
        res?.data != null && typeof res.data === "object" ? res.data : null;
      const row = {
        ...(created ?? {}),
        comment_id: created?.comment_id ?? Date.now(),
        content: created?.content ?? contentToSend,
        comment_created:
          created?.comment_created ?? new Date().toISOString(),
        parent_comment_id:
          created?.parent_comment_id ?? parentCommentId ?? null,
        user_id: created?.user_id ?? appUserId,
        comment_deleted: created?.comment_deleted ?? null,
        Users: {
          user_name: displayName,
          user_profile_url: meProfileRaw || null,
        },
      };
      onCommentCreated(row);
      setDraft("");
      setReplyTarget(null);
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error
          ? e.message
          : "댓글을 저장하는 중 문제가 생겼어요.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    draft,
    post?.post_id,
    appUserId,
    submitting,
    displayName,
    meProfileRaw,
    onCommentCreated,
    replyTarget?.id,
    replyTarget?.name,
  ]);

  const beginCommentLongPress = useCallback(
    (row, clientX, clientY, pressKey) => {
      flushCommentLongPressTimer();
      const lp = commentLongPressRef.current;
      lp.pointerId = pressKey;
      lp.startX = clientX;
      lp.startY = clientY;
      lp.timer = window.setTimeout(() => {
        lp.timer = null;
        lp.pointerId = null;
        setCommentDeletePrompt({ commentId: row.comment_id });
      }, COMMENT_LONG_PRESS_MS);
    },
    [flushCommentLongPressTimer],
  );

  const handleCommentRowPointerDown = (row) => (e) => {
    if (!isOwnSheetComment(row, appUserId)) return;
    if (accessPending || !accessReady) return;
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    beginCommentLongPress(row, e.clientX, e.clientY, `p:${e.pointerId}`);
  };

  const handleCommentRowPointerMove = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.timer == null || lp.pointerId == null) return;
    if (!String(lp.pointerId).startsWith("p:")) return;
    const pid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(pid) || pid !== e.pointerId) return;
    const dx = e.clientX - lp.startX;
    const dy = e.clientY - lp.startY;
    if (dx * dx + dy * dy > COMMENT_LONG_PRESS_MOVE_SQ)
      flushCommentLongPressTimer();
  };

  const handleCommentRowPointerEnd = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.pointerId == null || !String(lp.pointerId).startsWith("p:")) return;
    const pid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(pid) || pid !== e.pointerId) return;
    flushCommentLongPressTimer();
  };

  const handleCommentRowTouchStart = (row) => (e) => {
    if (!isOwnSheetComment(row, appUserId)) return;
    if (accessPending || !accessReady) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    beginCommentLongPress(row, t.clientX, t.clientY, `t:${t.identifier}`);
  };

  const handleCommentRowTouchMove = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.timer == null || lp.pointerId == null) return;
    if (!String(lp.pointerId).startsWith("t:")) return;
    const tid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(tid)) return;
    const t = Array.from(e.touches).find((x) => x.identifier === tid);
    if (!t) return;
    const dx = t.clientX - lp.startX;
    const dy = t.clientY - lp.startY;
    if (dx * dx + dy * dy > COMMENT_LONG_PRESS_MOVE_SQ)
      flushCommentLongPressTimer();
  };

  const handleCommentRowTouchEndOrCancel = (e) => {
    const lp = commentLongPressRef.current;
    if (lp.pointerId == null || !String(lp.pointerId).startsWith("t:")) return;
    const tid = Number(String(lp.pointerId).slice(2));
    if (!Number.isFinite(tid)) return;
    const ended = Array.from(e.changedTouches).some(
      (x) => x.identifier === tid,
    );
    if (ended) flushCommentLongPressTimer();
  };

  const handleOwnCommentContextMenu = (row) => (e) => {
    if (!isOwnSheetComment(row, appUserId)) return;
    if (accessPending || !accessReady) return;
    e.preventDefault();
    flushCommentLongPressTimer();
    setCommentDeletePrompt({ commentId: row.comment_id });
  };

  const dismissCommentDeletePrompt = useCallback(() => {
    setCommentDeletePrompt(null);
  }, []);

  const confirmCommentDelete = useCallback(async () => {
    const id = commentDeletePrompt?.commentId;
    if (id == null || commentDeleteSubmitting) return;
    const userId = Number(appUserId);
    if (!Number.isFinite(userId)) {
      alert("사용자 정보를 확인할 수 없습니다.");
      return;
    }
    flushCommentLongPressTimer();
    setCommentDeleteSubmitting(true);
    try {
      const result = await deleteComment({ commentId: id, userId });
      if (result.error) {
        alert(result.error);
        return;
      }
      setReplyTarget((cur) =>
        cur != null && String(cur.id) === String(id) ? null : cur,
      );
      setCommentDeletePrompt(null);
      onCommentDeleted?.(id);
    } finally {
      setCommentDeleteSubmitting(false);
    }
  }, [
    appUserId,
    commentDeletePrompt?.commentId,
    commentDeleteSubmitting,
    flushCommentLongPressTimer,
    onCommentDeleted,
  ]);

  if (!open || !post) return null;

  return (
    <div
      className="home-comment-overlay home-comment-overlay--flip-context mypage-flip-comment-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-flip-comment-title"
    >
      <button
        type="button"
        className="home-comment-backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        ref={sheetDrag.sheetRef}
        className={`home-comment-sheet mypage-flip-comment-sheet${sheetDrag.sheetDragging ? " home-comment-sheet--dragging" : ""}${sheetDrag.sheetExpanded ? " home-comment-sheet--expanded" : ""}`}
        style={sheetDrag.sheetStyle}
      >
        <div
          className="home-comment-handle-zone mypage-flip-comment-handle"
          onPointerDown={sheetDrag.onHandlePointerDown}
          onPointerMove={sheetDrag.onHandlePointerMove}
          onPointerUp={sheetDrag.onHandlePointerUp}
          onPointerCancel={sheetDrag.onHandlePointerCancel}
        >
          <div className="home-comment-handle" aria-hidden />
        </div>
        <h2 id="mypage-flip-comment-title" className="home-visually-hidden">
          댓글
        </h2>
        <div className="home-comment-scroll" ref={commentScrollRef}>
          {accessPending ? (
            <p className="home-visually-hidden" aria-live="polite">
              위치 확인 중
            </p>
          ) : !accessReady ? (
            <p className="home-comment-empty" role="status">
              이 위치에서는 댓글을 열 수 없습니다.
            </p>
          ) : thread.length > 0 ? (
            <ul className="home-comment-thread">
              {thread.map(({ row, depth }) => {
                const u = commentUserFromRow(row);
                const name = u.user_name || "사용자";
                const ownRow = isOwnSheetComment(row, appUserId);
                const profileRaw = ownRow
                  ? (typeof meProfileRaw === "string"
                      ? meProfileRaw.trim()
                      : "")
                  : typeof u.user_profile_url === "string"
                    ? u.user_profile_url.trim()
                    : "";
                const avatarSrc = resolvedProfileImageUrl(profileRaw);
                const body = commentBodyFromRow(row);
                const indentPx = depth > 0 ? Math.min(depth, 8) * 52 : 0;
                return (
                  <li
                    key={String(row.comment_id)}
                    className={`home-comment-item${depth > 0 ? " home-comment-item--nested" : ""}${ownRow ? " home-comment-item--own" : ""}`}
                    style={
                      indentPx > 0
                        ? { marginLeft: `${indentPx}px` }
                        : undefined
                    }
                    onPointerDown={
                      ownRow ? handleCommentRowPointerDown(row) : undefined
                    }
                    onPointerMove={
                      ownRow ? handleCommentRowPointerMove : undefined
                    }
                    onPointerUp={
                      ownRow ? handleCommentRowPointerEnd : undefined
                    }
                    onPointerCancel={
                      ownRow ? handleCommentRowPointerEnd : undefined
                    }
                    onTouchStart={
                      ownRow ? handleCommentRowTouchStart(row) : undefined
                    }
                    onTouchMove={
                      ownRow ? handleCommentRowTouchMove : undefined
                    }
                    onTouchEnd={
                      ownRow ? handleCommentRowTouchEndOrCancel : undefined
                    }
                    onTouchCancel={
                      ownRow ? handleCommentRowTouchEndOrCancel : undefined
                    }
                    onContextMenu={
                      ownRow ? handleOwnCommentContextMenu(row) : undefined
                    }
                  >
                    <img
                      className="home-comment-item__avatar"
                      src={avatarSrc}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                      }}
                    />
                    <div className="home-comment-item__main">
                      <p className="home-comment-item__name">{name}</p>
                      <p className="home-comment-item__text">{body}</p>
                    </div>
                    <div className="home-comment-item__aside">
                      <span className="home-comment-item__time">
                        {formatSheetCommentTime(row.comment_created)}
                      </span>
                      {depth < MAX_COMMENT_REPLY_DEPTH ? (
                        <button
                          type="button"
                          className="home-comment-item__reply"
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={() =>
                            setReplyTarget({
                              id: row.comment_id,
                              name,
                            })
                          }
                          disabled={accessPending || row.comment_id == null}
                        >
                          답글 달기
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="home-comment-empty" role="status">
              아직 댓글이 없네요
            </p>
          )}
        </div>
        <div className="home-comment-composer">
          {replyTarget ? (
            <div className="home-comment-reply-bar">
              <p className="home-comment-reply-bar__label">
                <span className="home-comment-reply-bar__name">
                  {replyTarget.name}
                </span>
                님에게 답글
              </p>
              <button
                type="button"
                className="home-comment-reply-bar__cancel"
                aria-label="답글 대상 취소"
                onClick={() => setReplyTarget(null)}
              >
                취소
              </button>
            </div>
          ) : null}
          <div className="home-comment-composer-inner">
            <img
              className="home-comment-composer-avatar"
              src={composerAvatar}
              alt=""
              onError={(e) => {
                e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
              }}
            />
            <label className="home-comment-input-wrap">
              <span className="home-visually-hidden">댓글 작성하기</span>
              <textarea
                className="home-comment-input"
                rows={1}
                placeholder="댓글 작성하기"
                disabled={accessPending || !accessReady || submitting}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="home-comment-send"
              aria-label="보내기"
              disabled={
                accessPending || !accessReady || !draft.trim() || submitting
              }
              onClick={() => void submit()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {commentDeletePrompt ? (
        <div className="home-comment-delete-layer">
          <button
            type="button"
            className="home-comment-delete-layer__backdrop"
            aria-label="취소"
            onClick={dismissCommentDeletePrompt}
          />
          <div
            className="home-comment-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mypage-flip-comment-delete-title"
          >
            <p
              id="mypage-flip-comment-delete-title"
              className="home-comment-delete-dialog__title"
            >
              삭제 하시겠습니까?
            </p>
            <div className="home-comment-delete-dialog__actions">
              <button
                type="button"
                className="home-comment-delete-dialog__btn home-comment-delete-dialog__btn--ghost"
                onClick={dismissCommentDeletePrompt}
                disabled={commentDeleteSubmitting}
              >
                취소
              </button>
              <button
                type="button"
                className="home-comment-delete-dialog__btn home-comment-delete-dialog__btn--danger"
                onClick={() => void confirmCommentDelete()}
                disabled={commentDeleteSubmitting}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
