import { supabase } from "../supabaseClient";

/** Supabase int/bigint 등 → JSON 직렬화 가능한 유한 숫자 (BigInt는 여기서만 Number로) */
function toFiniteNumber(value) {
  if (value == null) return null;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeFunctionJson(data) {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

/**
 * 게시글 장소 반경 내에서만 댓글 조회·작성 가능 여부 (Edge: check_comment_access).
 * 요청에 세션 JWT가 있으면, 해당 글 작성자 본인일 때는 반경과 무관하게 허용됩니다.
 * @param {number|string} postId
 * @param {number} userLatitude
 * @param {number} userLongitude
 */
export async function checkCommentAccess(postId, userLatitude, userLongitude) {
  const pid = toFiniteNumber(postId);
  if (pid == null) {
    return { invokeError: true, is_accessible: false };
  }
  const { data, error } = await supabase.functions.invoke(
    "check_comment_access",
    {
      body: { postId: pid, userLatitude, userLongitude },
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
  const pid = toFiniteNumber(postId);
  const uid = toFiniteNumber(userId);
  const parentNum =
    parentCommentId == null ? null : toFiniteNumber(parentCommentId);

  if (pid == null || uid == null) {
    return {
      error:
        "게시글 또는 사용자 식별값이 올바르지 않아 댓글을 저장할 수 없습니다.",
    };
  }

  const text = String(content ?? "").trim();
  if (!text) {
    return { error: "댓글 내용을 입력해 주세요." };
  }

  const body = {
    postId: pid,
    userId: uid,
    content: text,
    ...(parentNum != null ? { parentCommentId: parentNum } : {}),
  };

  let data;
  let error;
  try {
    const r = await supabase.functions.invoke("create_comment", { body });
    data = r.data;
    error = r.error;
  } catch (e) {
    console.error("create_comment invoke:", e);
    return {
      error:
        e instanceof Error
          ? e.message
          : "댓글을 저장하는 중 오류가 났습니다.",
    };
  }

  data = normalizeFunctionJson(data);

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

  if (data == null || typeof data !== "object") {
    return {
      error: "서버에서 댓글 저장 결과를 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return { data };
}

/**
 * 댓글 소프트 삭제 (Edge: delete_comment, 작성자만)
 * @param {{ commentId: number|string, userId: number|string }} params
 */
export async function deleteComment({ commentId, userId }) {
  const cid = toFiniteNumber(commentId);
  const uid = toFiniteNumber(userId);
  if (cid == null || uid == null) {
    return { error: "댓글·사용자 정보가 올바르지 않습니다." };
  }

  let data;
  let error;
  try {
    const r = await supabase.functions.invoke("delete_comment", {
      body: { commentId: cid, userId: uid },
    });
    data = r.data;
    error = r.error;
  } catch (e) {
    console.error("delete_comment invoke:", e);
    return {
      error:
        e instanceof Error
          ? e.message
          : "댓글을 삭제하는 중 오류가 났습니다.",
    };
  }

  data = normalizeFunctionJson(data);

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
