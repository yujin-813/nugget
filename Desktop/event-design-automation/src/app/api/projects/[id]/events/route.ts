import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    const access = await requireProjectAccess(id);
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const events = await prisma.event.findMany({
      where: { projectId: id },
      include: { properties: true },
      orderBy: { createdAt: "desc" },
    });

    await logActivity({
      name: "result_viewed",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { source: "events_list" },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("Fetch Events Error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
