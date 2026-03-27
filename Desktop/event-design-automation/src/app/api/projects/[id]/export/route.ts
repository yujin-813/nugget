import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;
    
    // Fetch project and approved/ready events
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return new NextResponse("Project not found", { status: 404 });

    const events = await prisma.event.findMany({
      where: { 
        projectId: id,
        status: { in: ["approved", "ready_for_dev"] }
      },
      include: { properties: true },
      orderBy: { createdAt: "desc" },
    });

    if (events.length === 0) {
      return new NextResponse("No approved events found to export.", { status: 400 });
    }

    // Generate CSV
    const headers = [
      "Event Code",
      "Event Name",
      "Description",
      "Trigger Type",
      "Trigger Condition",
      "Parameter Template",
      "Priority",
      "Status"
    ];

    const csvRows = [headers.join(",")];

    for (const ev of events) {
      const eventCode = ev.properties.find((p) => p.propertyName === "event_code")?.exampleValue || "";
      const paramTemplate = ev.properties
        .filter((p) => p.propertyName !== "event_code")
        .map((p) => `${p.propertyName}:${p.propertyType}${p.isRequired ? "!" : ""}`)
        .join(" | ");
      const row = [
        `"${eventCode}"`,
        `"${ev.eventName}"`,
        `"${ev.description || ''}"`,
        `"${ev.triggerType || ''}"`,
        `"${ev.triggerCondition || ''}"`,
        `"${paramTemplate}"`,
        `"${ev.priority || ''}"`,
        `"${ev.status}"`
      ];
      csvRows.push(row.join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel UTF-8 support

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tracking_plan_${project.name}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export CSV Error:", error);
    return new NextResponse("Failed to export events", { status: 500 });
  }
}
