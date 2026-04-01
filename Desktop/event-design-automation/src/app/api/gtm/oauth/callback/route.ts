import { NextResponse } from "next/server";
import {
  GTM_ACCESS_TOKEN_COOKIE,
  GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  GTM_CONNECTED_EMAIL_COOKIE,
  GTM_OAUTH_STATE_COOKIE,
  GTM_REFRESH_TOKEN_COOKIE,
  parseCookieHeader,
  parseOauthState,
} from "@/lib/gtmOAuth";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/projects?gtm_oauth=error&reason=${encodeURIComponent(error)}`, url.origin));
  }

  const cookieMap = parseCookieHeader(request.headers.get("cookie"));
  const cookieState = cookieMap[GTM_OAUTH_STATE_COOKIE];
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/projects?gtm_oauth=error&reason=state_mismatch", url.origin));
  }

  const parsedState = parseOauthState(state);
  if (!parsedState?.projectId) {
    return NextResponse.redirect(new URL("/projects?gtm_oauth=error&reason=invalid_state", url.origin));
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL(`/projects/${parsedState.projectId}/events?gtm_oauth=error&reason=server_env`, url.origin));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.redirect(
      new URL(`/projects/${parsedState.projectId}/events?gtm_oauth=error&reason=token_exchange_failed`, url.origin)
    );
  }

  const redirectTo = new URL(`/projects/${parsedState.projectId}/events?gtm_oauth=connected`, url.origin);
  const res = NextResponse.redirect(redirectTo);
  const expiresAt = Date.now() + (tokenJson.expires_in || 3600) * 1000;
  res.cookies.set(GTM_ACCESS_TOKEN_COOKIE, tokenJson.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokenJson.expires_in || 3600,
  });
  if (tokenJson.refresh_token) {
    res.cookies.set(GTM_REFRESH_TOKEN_COOKIE, tokenJson.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  res.cookies.set(GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE, String(expiresAt), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set(GTM_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GTM_CONNECTED_EMAIL_COOKIE, "connected", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

