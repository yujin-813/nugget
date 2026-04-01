import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
  if (token) {
    await destroySession(token);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
