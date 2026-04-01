import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE, ensureDefaultWorkspace } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function buildRedirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/callback`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = cookies().get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", url.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=oauth_config", url.origin));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: buildRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/login?error=token_exchange", url.origin));
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?error=token_missing", url.origin));
  }

  const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) {
    return NextResponse.redirect(new URL("/login?error=userinfo", url.origin));
  }
  const userInfo = await userInfoRes.json();

  const email = String(userInfo.email || "").trim().toLowerCase();
  const name = String(userInfo.name || "").trim();
  const image = String(userInfo.picture || "").trim();
  const googleSub = String(userInfo.sub || "").trim();

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=no_email", url.origin));
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, image, googleSub },
    create: { email, name, image, googleSub },
  });

  const workspace = await ensureDefaultWorkspace(user.id);
  await logActivity({
    name: "login",
    userId: user.id,
    workspaceId: workspace?.id || null,
  });

  const session = await createSession(user.id);
  const response = NextResponse.redirect(new URL("/projects", url.origin));
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  response.cookies.delete("oauth_state");
  return response;
}
