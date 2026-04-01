export const GTM_OAUTH_STATE_COOKIE = "gtm_oauth_state";
export const GTM_ACCESS_TOKEN_COOKIE = "gtm_access_token";
export const GTM_REFRESH_TOKEN_COOKIE = "gtm_refresh_token";
export const GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE = "gtm_access_token_expires_at";
export const GTM_CONNECTED_EMAIL_COOKIE = "gtm_connected_email";

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

export function makeOauthState(projectId: string) {
  const payload = {
    projectId,
    nonce: Math.random().toString(36).slice(2, 12),
    ts: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseOauthState(state: string | null | undefined): { projectId: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
      projectId?: string;
      ts?: number;
    };
    if (!parsed.projectId) return null;
    return { projectId: parsed.projectId };
  } catch {
    return null;
  }
}

