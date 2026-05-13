import { useEffect, useMemo } from "react";
import { likerRowsForOwnPostDialog } from "../utils/likesUi";
import {
  DEFAULT_PROFILE_IMAGE,
  resolvedProfileImageUrl,
} from "../utils/profileImage";
import "./OwnPostLikersDialog.css";

/**
 * @param {{
 *   post: Record<string, unknown>;
 *   onClose: () => void;
 *   backdropPassthrough?: boolean;
 * }} props
 * backdropPassthrough: 딤은 pointer-events 없음 — 부모 오버레이에서 배경 탭 처리
 */
export default function OwnPostLikersDialog({
  post,
  onClose,
  backdropPassthrough = false,
}) {
  const rows = useMemo(() => likerRowsForOwnPostDialog(post), [post]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const overlayClass =
    `own-likers-overlay${backdropPassthrough ? " own-likers-overlay--pass-through" : ""}`;

  return (
    <div
      className={overlayClass}
      role="presentation"
      onClick={
        backdropPassthrough
          ? undefined
          : (e) => {
              e.stopPropagation();
              onClose();
            }
      }
    >
      <div
        className="own-likers-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="own-likers-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="own-likers-dialog__head">
          <h2 id="own-likers-title" className="own-likers-dialog__title">
            좋아요 {rows.length}명
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="own-likers-dialog__empty">아직 좋아요가 없어요.</p>
        ) : (
          <ul className="own-likers-dialog__list">
            {rows.map((row) => (
              <li key={row.key} className="own-likers-dialog__item">
                <img
                  className="own-likers-dialog__avatar"
                  src={resolvedProfileImageUrl(row.profileRaw)}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                  }}
                />
                <span className="own-likers-dialog__name">
                  {row.displayName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
