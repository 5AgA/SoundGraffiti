import { supabase } from "../supabaseClient";

/**
 * 게시글 장소 반경 내에서만 댓글 조회·작성 가능 여부 (Edge: check_comment_access)
 * @param {number|string} postId
 * @param {number} userLatitude
 * @param {number} userLongitude
 */
export async function checkCommentAccess(postId, userLatitude, userLongitude) {
  const { data, error } = await supabase.functions.invoke(
    "check_comment_access",
    {
      body: { postId, userLatitude, userLongitude },
    },
  );

  if (error) {
    console.error("check_comment_access:", error);
    return { invokeError: true, is_accessible: false };
  }

  return data;
}

/**
 * 댓글 생성 (Edge: create_comment)
 * @param {{ postId: number|string, userId: number, content: string, parentCommentId?: number|string }} params
 */
export async function createComment({
  postId,
  userId,
  content,
  parentCommentId,
}) {
  const body = {
    postId,
    userId,
    content,
    ...(parentCommentId != null ? { parentCommentId } : {}),
  };

  const { data, error } = await supabase.functions.invoke("create_comment", {
    body,
  });

  if (error) {
    console.error("create_comment:", error);
    let message = error.message ?? "댓글을 저장하지 못했습니다.";
    try {
      const ctx = error.context;
      if (ctx != null) {
        const parsed =
          typeof ctx === "object" && ctx.body != null
            ? typeof ctx.body === "string"
              ? JSON.parse(ctx.body)
              : ctx.body
            : null;
        if (parsed?.error) message = String(parsed.error);
      }
    } catch {
      /* 본문 파싱 실패 시 위 기본 메시지 유지 */
    }
    return { error: message };
  }

  if (data && typeof data === "object" && data.error) {
    return { error: String(data.error) };
  }

  return { data };
}

/**
 * 댓글 소프트 삭제 (Edge: delete_comment, 작성자만)
 * @param {{ commentId: number|string, userId: number|string }} params
 */
export async function deleteComment({ commentId, userId }) {
  const { data, error } = await supabase.functions.invoke("delete_comment", {
    body: { commentId, userId },
  });

  if (error) {
    console.error("delete_comment:", error);
    let message = error.message ?? "댓글을 삭제하지 못했습니다.";
    try {
      const ctx = error.context;
      if (ctx != null) {
        const parsed =
          typeof ctx === "object" && ctx.body != null
            ? typeof ctx.body === "string"
              ? JSON.parse(ctx.body)
              : ctx.body
            : null;
        if (parsed?.error) message = String(parsed.error);
      }
    } catch {
      /* keep message */
    }
    return { error: message };
  }

  if (data && typeof data === "object" && data.error) {
    return { error: String(data.error) };
  }

  return { data };
}
