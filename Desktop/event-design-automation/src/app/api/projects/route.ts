import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkspace, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const userOrResponse = await requireUser();
    if (userOrResponse instanceof NextResponse) return userOrResponse;
    const user = userOrResponse;

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    const workspaceIds = memberships.map((m) => m.workspaceId);
    if (workspaceIds.length === 0) {
      return NextResponse.json([]);
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId: { in: workspaceIds } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { events: true }
        }
      }
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET Projects Error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userOrResponse = await requireUser();
    if (userOrResponse instanceof NextResponse) return userOrResponse;
    const user = userOrResponse;

    const body = await request.json();
    const {
      name,
      targetUrl,
      analysisGoal,
      toolType,
      gtmAccountId,
      gtmContainerId,
      gtmWorkspaceId,
      ga4MeasurementId,
      amplitudeApiKey,
    } = body;
    
    if (!name || !targetUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const workspace = await ensureDefaultWorkspace(user.id);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const normalizedToolType =
      toolType === "amplitude" ? "amplitude" : "ga4";

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name,
        targetUrl,
        analysisGoal: analysisGoal || "General",
        toolType: normalizedToolType,
        gtmAccountId: gtmAccountId?.trim() || null,
        gtmContainerId: gtmContainerId?.trim() || null,
        gtmWorkspaceId: gtmWorkspaceId?.trim() || null,
        ga4MeasurementId: ga4MeasurementId?.trim() || null,
        amplitudeApiKey: amplitudeApiKey?.trim() || null,
      },
    });

    await logActivity({
      name: "project_created",
      userId: user.id,
      workspaceId: workspace.id,
      projectId: project.id,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST Project Error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
