import { useCallback, useEffect, useMemo, useState } from "react";
import { createComment } from "../api/comments";
import {
  DEFAULT_PROFILE_IMAGE,
  resolvedProfileImageUrl,
} from "../utils/profileImage";

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

function formatCommentTime(iso) {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 마이페이지 플립 모달용 댓글 시트 (홈 `home-comment-*` 스타일 재사용, 드래그 없음)
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
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setDraft("");
  }, [open, post?.post_id]);

  const thread = useMemo(() => {
    if (!post) return [];
    return commentsFromPost(post);
  }, [post]);

  const composerAvatar = resolvedProfileImageUrl(meProfileRaw);

  const submit = useCallback(async () => {
    const text = draft.trim();
    const postId = post?.post_id;
    if (!text || postId == null || appUserId == null || submitting) return;
    setSubmitting(true);
    try {
      const res = await createComment({
        postId,
        userId: appUserId,
        content: text,
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      const row = {
        comment_id: res?.data?.comment_id ?? Date.now(),
        content: text,
        comment_created: new Date().toISOString(),
        comment_deleted: null,
        Users: {
          user_name: displayName,
          user_profile_url: meProfileRaw || null,
        },
      };
      onCommentCreated(row);
      setDraft("");
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
      <div className="home-comment-sheet mypage-flip-comment-sheet">
        <div className="home-comment-handle-zone mypage-flip-comment-handle">
          <div className="home-comment-handle" aria-hidden />
        </div>
        <h2 id="mypage-flip-comment-title" className="home-visually-hidden">
          댓글
        </h2>
        <div className="home-comment-scroll">
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
              {thread.map((row) => {
                const u = commentUserFromRow(row);
                const name = u.user_name || "사용자";
                const profileRaw =
                  typeof u.user_profile_url === "string"
                    ? u.user_profile_url.trim()
                    : "";
                const avatarSrc = resolvedProfileImageUrl(profileRaw);
                return (
                  <li key={String(row.comment_id)} className="home-comment-item">
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
                      <p className="home-comment-item__text">{row.content}</p>
                    </div>
                    <div className="home-comment-item__aside">
                      <span className="home-comment-item__time">
                        {formatCommentTime(row.comment_created)}
                      </span>
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
    </div>
  );
}
