import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function buildFallbackEventCode(eventId: string, index: number) {
  const short = (eventId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `EVT_${String(index + 1).padStart(4, "0")}${short ? `_${short}` : ""}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    // Prefer approved/ready events; fallback to all events to avoid export failure.
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return new NextResponse("Project not found", { status: 404 });

    const approvedOrReadyEvents = await prisma.event.findMany({
      where: { 
        projectId: id,
        status: { in: ["approved", "ready_for_dev"] }
      },
      include: { properties: true },
      orderBy: { createdAt: "desc" },
    });

    const events =
      approvedOrReadyEvents.length > 0
        ? approvedOrReadyEvents
        : await prisma.event.findMany({
            where: { projectId: id },
            include: { properties: true },
            orderBy: { createdAt: "desc" },
          });

    if (events.length === 0) {
      return new NextResponse("No events found to export.", { status: 400 });
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

    for (const [index, ev] of events.entries()) {
      const existingEventCode = ev.properties.find((p) => p.propertyName === "event_code")?.exampleValue;
      const eventCode = existingEventCode || buildFallbackEventCode(ev.id, index);
      const paramTemplateBody = ev.properties
        .filter((p) => p.propertyName !== "event_code")
        .map((p) => `${p.propertyName}:${p.propertyType}${p.isRequired ? "!" : ""}`)
        .join(" | ");
      const paramTemplate = [`event_code:string!(${eventCode})`, paramTemplateBody]
        .filter(Boolean)
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
