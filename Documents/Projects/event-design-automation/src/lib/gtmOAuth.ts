import crypto from "crypto";

export const GTM_OAUTH_STATE_COOKIE = "gtm_oauth_state";
export const GTM_ACCESS_TOKEN_COOKIE = "gtm_access_token";
export const GTM_REFRESH_TOKEN_COOKIE = "gtm_refresh_token";
export const GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE = "gtm_access_token_expires_at";
export const GTM_CONNECTED_EMAIL_COOKIE = "gtm_connected_email";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function isSecureRequest(request: Request) {
  if (process.env.NODE_ENV === "production") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveGtmOauthRedirectUri(request: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const envPreferred = isProd
    ? process.env.GOOGLE_OAUTH_REDIRECT_URI_PROD
    : process.env.GOOGLE_OAUTH_REDIRECT_URI_LOCAL;

  const explicit = envPreferred || process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;

  const baseUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL(request.url).origin;
  return `${trimTrailingSlash(baseUrl)}/api/gtm/oauth/callback`;
}

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
    nonce: crypto.randomBytes(16).toString("hex"),
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
