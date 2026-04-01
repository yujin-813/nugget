import { prisma } from "@/lib/prisma";

type ActivityPayload = {
  name: string;
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logActivity(payload: ActivityPayload) {
  try {
    const { name, userId, workspaceId, projectId, metadata } = payload;
    if (!name) return;
    await prisma.activityEvent.create({
      data: {
        name,
        userId: userId || null,
        workspaceId: workspaceId || null,
        projectId: projectId || null,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (error) {
    console.error("Activity Log Error:", error);
  }
}
