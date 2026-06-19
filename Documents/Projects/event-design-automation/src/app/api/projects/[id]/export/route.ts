import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

function buildFallbackEventCode(eventId: string, index: number) {
  const short = (eventId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `EVT_${String(index + 1).padStart(4, "0")}${short ? `_${short}` : ""}`;
}

function toSafeFilename(projectName: string) {
  const ascii = (projectName || "project")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "project";
  return {
    ascii: `tracking_plan_${ascii}.csv`,
    encoded: `tracking_plan_${encodeURIComponent(projectName || "project")}.csv`,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    const access = await requireProjectAccess(id);
    if (access instanceof NextResponse) return access;

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
      "User Property Template",
      "Priority",
      "Status"
    ];

    const csvRows = [headers.join(",")];

    for (const [index, ev] of events.entries()) {
      const existingEventCode = ev.properties.find((p) => p.propertyName === "event_code")?.exampleValue;
      const eventCode = existingEventCode || buildFallbackEventCode(ev.id, index);
      const eventParams = ev.properties.filter(
        (p) => p.propertyName !== "event_code" && !p.propertyName.startsWith("user_")
      );
      const userParams = ev.properties.filter((p) => p.propertyName.startsWith("user_"));
      const paramTemplateBody = eventParams
        .map((p) => `${p.propertyName}:${p.propertyType}${p.isRequired ? "!" : ""}`)
        .join(" | ");
      const userPropertyTemplate = userParams
        .map((p) => `${p.propertyName}:${p.propertyType}${p.isRequired ? "!" : ""}`)
        .join(" | ");
      const paramTemplate = [`event_code:string!(${eventCode})`, paramTemplateBody]
        .filter(Boolean)
        .join(" | ");
      const esc = (s: string) => s.replace(/"/g, '""');
      const row = [
        `"${esc(eventCode)}"`,
        `"${esc(ev.eventName)}"`,
        `"${esc(ev.description || '')}"`,
        `"${esc(ev.triggerType || '')}"`,
        `"${esc(ev.triggerCondition || '')}"`,
        `"${esc(paramTemplate)}"`,
        `"${esc(userPropertyTemplate)}"`,
        `"${esc(ev.priority || '')}"`,
        `"${esc(ev.status)}"`
      ];
      csvRows.push(row.join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel UTF-8 support

    const filename = toSafeFilename(project.name);

    const response = new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.ascii}"; filename*=UTF-8''${filename.encoded}`,
      },
    });
    await logActivity({
      name: "export_downloaded",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { format: "csv" },
    });
    await logActivity({
      name: "definition_uploaded",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { format: "csv", source: "export" },
    });
    return response;
  } catch (error) {
    console.error("Export CSV Error:", error);
    return new NextResponse("Failed to export events", { status: 500 });
  }
}
