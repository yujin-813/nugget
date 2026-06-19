import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE } from "@/lib/constants";
const SESSION_DAYS = 14;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const BYPASS_USER_EMAIL = "dev@bypass.local";

async function getOrCreateBypassUser() {
  return prisma.user.upsert({
    where: { email: BYPASS_USER_EMAIL },
    update: {},
    create: { email: BYPASS_USER_EMAIL, name: "Dev User" },
  });
}

export async function getSessionTokenFromCookies() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value || "";
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId, token, expiresAt },
  });
  return { token: session.token, expiresAt: session.expiresAt };
}

export async function destroySession(token: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

export async function getCurrentUser() {
  if (BYPASS_AUTH) return getOrCreateBypassUser();
  const token = await getSessionTokenFromCookies();
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  return session.user;
}

export async function requireUser() {
  if (BYPASS_AUTH) return getOrCreateBypassUser();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export async function requireUserForPage() {
  if (BYPASS_AUTH) return getOrCreateBypassUser();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function ensureDefaultWorkspace(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (user.defaultWorkspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: user.defaultWorkspaceId },
    });
    if (workspace) return workspace;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: user.name ? `${user.name} Workspace` : "My Workspace",
      members: {
        create: { userId, role: "owner" },
      },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { defaultWorkspaceId: workspace.id },
  });

  await logActivity({
    name: "workspace_created",
    userId,
    workspaceId: workspace.id,
    metadata: { source: "auto_default" },
  });

  return workspace;
}

export async function requireProjectAccess(
  projectId: string,
  options?: { write?: boolean }
) {
  const userOrResponse = await requireUser();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (!project.workspaceId) {
    const workspace = await ensureDefaultWorkspace(user.id);
    if (workspace) {
      await prisma.project.update({
        where: { id: projectId },
        data: { workspaceId: workspace.id },
      });
      project.workspaceId = workspace.id;
    }
  }

  if (!project.workspaceId) {
    return NextResponse.json({ error: "Workspace not assigned" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: project.workspaceId,
        userId: user.id,
      },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (options?.write && membership.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user, project, membership, workspaceId: project.workspaceId };
}

export async function requireWorkspaceAccess(
  workspaceId: string,
  options?: { write?: boolean }
) {
  const userOrResponse = await requireUser();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (options?.write && membership.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user, membership, workspaceId };
}

export async function requireEventAccess(
  eventId: string,
  options?: { write?: boolean }
) {
  const userOrResponse = await requireUser();
  if (userOrResponse instanceof NextResponse) return userOrResponse;
  const user = userOrResponse;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { project: true },
  });
  if (!event || !event.project) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  let workspaceId = event.project.workspaceId || null;
  if (!workspaceId) {
    const workspace = await ensureDefaultWorkspace(user.id);
    if (workspace) {
      await prisma.project.update({
        where: { id: event.projectId },
        data: { workspaceId: workspace.id },
      });
      workspaceId = workspace.id;
    }
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not assigned" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (options?.write && membership.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user, event, workspaceId, membership };
}
