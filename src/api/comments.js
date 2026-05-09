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
