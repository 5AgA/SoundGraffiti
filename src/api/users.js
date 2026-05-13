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

export async function getCurrentUser() {
  const { data, error } = await supabase.functions.invoke("get-current-user");

  if (error) {
    console.error("get-current-user:", error);
    return null;
  }

  if (data && typeof data === "object" && data.error) {
    console.warn("get-current-user:", data.error);
    return null;
  }

  return data?.user ?? null;
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

const PROFILE_IMAGE_BUCKET = "post-media";

/** @param {string} ext */
function normalizeImageExt(ext, mime) {
  const e = (ext || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const allowed = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  if (allowed.has(e)) return e === "jpeg" ? "jpg" : e;
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "jpg";
}

/**
 * 프로필 사진을 Storage에 올리고 공개 URL을 반환합니다 (`post-media/avatars/{userId}/…`).
 * @param {number} userId `Users.user_id`
 * @param {File} file
 * @returns {Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }>}
 */
export async function uploadUserProfileImage(userId, file) {
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    return { ok: false, error: "사용자 정보가 올바르지 않아요." };
  }
  if (!(file instanceof File) || file.size < 1) {
    return { ok: false, error: "이미지 파일을 선택해 주세요." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "이미지 파일만 업로드할 수 있어요." };
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, error: "5MB 이하 이미지를 선택해 주세요." };
  }

  const rawExt = file.name.includes(".") ? file.name.split(".").pop() || "" : "";
  const ext = normalizeImageExt(rawExt, file.type);
  const path = `avatars/${id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || `image/${ext}`,
    });

  if (uploadError) {
    console.error("uploadUserProfileImage:", uploadError);
    return {
      ok: false,
      error: uploadError.message ?? "이미지를 업로드하지 못했어요.",
    };
  }

  const { data } = supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .getPublicUrl(path);

  const publicUrl = data?.publicUrl;
  if (typeof publicUrl !== "string" || !publicUrl.trim()) {
    return { ok: false, error: "업로드 URL을 만들지 못했어요." };
  }
  return { ok: true, publicUrl: publicUrl.trim() };
}

/**
 * @param {number} userId `Users.user_id`
 * @param {{ user_name?: string; user_profile_url?: string | null }} patch
 * @returns {Promise<{ ok: true; data: unknown } | { ok: false; error: string }>}
 */
export async function updateUserProfile(userId, patch) {
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    return { ok: false, error: "사용자 정보가 올바르지 않아요." };
  }

  /** @type {Record<string, string | null>} */
  const row = {};
  if (patch.user_name !== undefined) {
    const s = String(patch.user_name).trim();
    if (!s) return { ok: false, error: "이름은 한 글자 이상 입력해 주세요." };
    row.user_name = s;
  }
  if (patch.user_profile_url !== undefined) {
    const s =
      patch.user_profile_url == null
        ? ""
        : String(patch.user_profile_url).trim();
    row.user_profile_url = s.length ? s : null;
  }

  if (Object.keys(row).length === 0) {
    return { ok: false, error: "변경할 내용이 없어요." };
  }

  const { data, error } = await supabase
    .from("Users")
    .update(row)
    .eq("user_id", id)
    .select("user_id, user_name, user_profile_url")
    .maybeSingle();

  if (error) {
    console.error("updateUserProfile:", error);
    return {
      ok: false,
      error: error.message ?? "프로필을 저장하지 못했어요.",
    };
  }
  if (data == null) {
    return { ok: false, error: "프로필을 저장하지 못했어요." };
  }
  return { ok: true, data };
}
