import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
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

    const normalizedToolType =
      toolType === "amplitude" ? "amplitude" : "ga4";

    const project = await prisma.project.create({
      data: {
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

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST Project Error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
