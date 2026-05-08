import { supabase } from "../supabaseClient";

/**
 * @param {number} userId
 * @returns {Promise<{ user_id: number, user_name?: string, user_profile_url?: string } | null>}
 */
export async function getUserById(userId) {
  const { data, error } = await supabase
    .from("Users")
    .select("user_id, user_name, user_profile_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserById:", error);
    return null;
  }
  return data ?? null;
}

/**
 * 피드와 동일하게 게시된·임시 글만 카운트 (삭제 제외)
 * @param {number} userId
 */
export async function getUserPostCount(userId) {
  const { count, error } = await supabase
    .from("Posts")
    .select("post_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("post_deleted", null)
    .in("status", ["published", "draft"]);

  if (error) {
    console.error("getUserPostCount:", error);
    return null;
  }
  return typeof count === "number" ? count : 0;
}
