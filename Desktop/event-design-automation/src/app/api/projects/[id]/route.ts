import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const parseJson = <T,>(value: string | null | undefined, fallback: T): T => {
      if (!value) return fallback;
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    };

    const params = await context.params;
    const id = params.id;

    const access = await requireProjectAccess(id);
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        pages: {
          include: { components: true }
        },
        events: {
          select: {
            id: true,
            pageId: true,
            eventName: true,
            status: true,
          },
        },
        analyzeJobs: {
          where: { status: "completed" },
          orderBy: { completedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            completedAt: true,
            resultJson: true,
          },
        },
        _count: {
          select: { events: true, pages: true }
        }
      }
    });
    
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const latestAnalyze = project.analyzeJobs?.[0] || null;
    const analyzeSnapshot = latestAnalyze
      ? parseJson<Record<string, unknown>>(latestAnalyze.resultJson, {})
      : null;

    const response = NextResponse.json({
      ...project,
      analyzeSnapshot,
      latestAnalyze: latestAnalyze
        ? {
            id: latestAnalyze.id,
            status: latestAnalyze.status,
            completedAt: latestAnalyze.completedAt,
          }
        : null,
    });
    await logActivity({
      name: "result_viewed",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: project.id,
      metadata: { source: "project_detail" },
    });
    return response;
  } catch (error) {
    console.error("GET Project Error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = params.id;

    const access = await requireProjectAccess(id, { write: true });
    if (access instanceof NextResponse) return access;

    await prisma.project.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Project Error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
