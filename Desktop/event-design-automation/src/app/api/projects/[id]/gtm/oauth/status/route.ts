import { NextResponse } from "next/server";
import { parseCookieHeader, GTM_ACCESS_TOKEN_COOKIE, GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE, GTM_CONNECTED_EMAIL_COOKIE, GTM_REFRESH_TOKEN_COOKIE } from "@/lib/gtmOAuth";
import { requireProjectAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (access instanceof NextResponse) return access;
  const cookieMap = parseCookieHeader(request.headers.get("cookie"));
  const accessToken = cookieMap[GTM_ACCESS_TOKEN_COOKIE];
  const refreshToken = cookieMap[GTM_REFRESH_TOKEN_COOKIE];
  const connectedLabel = cookieMap[GTM_CONNECTED_EMAIL_COOKIE] || null;
  const expiresAt = Number(cookieMap[GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE] || 0) || null;

  return NextResponse.json({
    connected: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    connectedLabel,
    expiresAt,
    expired: expiresAt ? Date.now() > expiresAt : null,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id, { write: true });
  if (access instanceof NextResponse) return access;
  const res = NextResponse.json({ success: true });
  res.cookies.set(GTM_ACCESS_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GTM_REFRESH_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GTM_ACCESS_TOKEN_EXPIRES_AT_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GTM_CONNECTED_EMAIL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
