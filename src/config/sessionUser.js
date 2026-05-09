/**
 * 앱 전역에서 쓰는 “세션 사용자”의 Supabase `Users.user_id`.
 * - 기본값: 1 (개발·임시)
 * - `.env`: VITE_DEV_APP_USER_ID=숫자 로 변경 가능
 */
export function parseDevAppUserId() {
  const raw = import.meta.env?.VITE_DEV_APP_USER_ID;
  if (raw === undefined || raw === "") return 1;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export const DEV_APP_USER_ID = parseDevAppUserId();

/**
 * Supabase Auth `user` 행에 `Users.user_id` 를 맞춰 붙인 객체 (또는 비로그인 시 최소 객체).
 * @param {Record<string, unknown> | null} supabaseUser
 */
export function createSessionUser(supabaseUser) {
  if (supabaseUser) {
    return { ...supabaseUser, id: DEV_APP_USER_ID };
  }
  return {
    id: DEV_APP_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "dev-local@soundgraffiti.invalid",
    app_metadata: {},
    user_metadata: {},
  };
}
