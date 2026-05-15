function postAuthorUserId(post) {
  if (post == null || typeof post !== "object") return null;
  const top = post.user_id ?? post.userId;
  if (top != null && top !== "") return top;
  const raw = post.Users ?? post.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  if (u == null || typeof u !== "object") return null;
  return u.user_id ?? u.userId ?? null;
}

export function isViewerAuthorOfPost(post, viewerUserId) {
  if (viewerUserId == null || post == null) return false;
  const aid = postAuthorUserId(post);
  if (aid == null) return false;
  return String(aid) === String(viewerUserId);
}

function likeNestedUserName(like) {
  if (like == null || typeof like !== "object") return "";
  const raw = like.Users ?? like.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  return typeof u?.user_name === "string" ? u.user_name.trim() : "";
}

function likesArrayFromPost(post) {
  const raw = post?.Likes ?? post?.likes;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function likeNestedUserProfileRaw(like) {
  if (like == null || typeof like !== "object") return "";
  const raw = like.Users ?? like.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  if (u == null || typeof u !== "object") return "";
  const candidates = [u.user_profile_url, u.profile_image_url];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
  }
  return "";
}

function likerRowsFromLikes(likes) {
  const list = Array.isArray(likes) ? likes : [];
  const rows = [];
  for (const lk of list) {
    if (!lk || typeof lk !== "object") continue;
    const uid = lk.user_id ?? lk.userId;
    const name = likeNestedUserName(lk);
    const displayName =
      name || (uid != null && uid !== "" ? `사용자 ${uid}` : "이름 없음");
    const profileRaw = likeNestedUserProfileRaw(lk);
    rows.push({
      key: String(uid ?? lk.like_id ?? rows.length),
      displayName,
      profileRaw,
    });
  }
  return rows;
}

export function likerRowsForOwnPostDialog(post) {
  return likerRowsFromLikes(likesArrayFromPost(post));
}
