import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";

function parseResultJson(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const params = await context.params;
    const { id, jobId } = params;

    const access = await requireProjectAccess(id);
    if (access instanceof NextResponse) return access;

    const job = await prisma.analyzeJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.projectId !== id) {
      return NextResponse.json({ error: "Analyze job not found" }, { status: 404 });
    }

    return NextResponse.json({
      job_id: job.id,
      project_id: job.projectId,
      status: job.status, // queued | running | completed | failed
      progress: job.progress,
      error: job.errorMessage,
      result: parseResultJson(job.resultJson),
      created_at: job.createdAt,
      started_at: job.startedAt,
      completed_at: job.completedAt,
    });
  } catch (error) {
    console.error("Analyze Job Status Error:", error);
    return NextResponse.json({ error: "Failed to fetch analyze job status" }, { status: 500 });
  }
}
