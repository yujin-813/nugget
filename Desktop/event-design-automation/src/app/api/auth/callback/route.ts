import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, ensureDefaultWorkspace } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

function sanitizeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function buildRedirectUri(request: Request) {
  const explicitBase = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicitBase) {
    return `${explicitBase.replace(/\/+$/, "")}/api/auth/callback`;
  }
  const url = new URL(request.url);
  return `${url.origin}/api/auth/callback`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  const nextPath = sanitizeNextPath(cookieStore.get("oauth_next")?.value ?? null);
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || url.origin;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_state", baseUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=oauth_config", baseUrl));
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
    return NextResponse.redirect(new URL("/login?error=token_exchange", baseUrl));
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login?error=token_missing", baseUrl));
  }

  const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) {
    return NextResponse.redirect(new URL("/login?error=userinfo", baseUrl));
  }
  const userInfo = await userInfoRes.json();

  const email = String(userInfo.email || "").trim().toLowerCase();
  const name = String(userInfo.name || "").trim();
  const image = String(userInfo.picture || "").trim();
  const googleSub = String(userInfo.sub || "").trim();

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=no_email", baseUrl));
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
  const response = NextResponse.redirect(new URL(nextPath || "/projects", baseUrl));
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  response.cookies.delete("oauth_state");
  response.cookies.delete("oauth_next");
  return response;
}
