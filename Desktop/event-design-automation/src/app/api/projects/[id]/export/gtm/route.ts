import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

type ApprovedEvent = {
  id: string;
  eventName: string;
  description: string | null;
  triggerType: string | null;
  triggerCondition: string | null;
  sourceType: string;
  status: string;
  properties: Array<{
    propertyName: string;
    propertyType: string;
    exampleValue: string | null;
    isRequired: boolean;
  }>;
};

function sanitizeName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "project";
}

function inferTriggerType(event: ApprovedEvent) {
  const trigger = (event.triggerType || "").toLowerCase();
  if (trigger.includes("load")) return "page_view";
  if (trigger.includes("submit")) return "form_submission";
  if (trigger.includes("download")) return "file_download";
  if (trigger.includes("click") || trigger.includes("navigate")) return "click";
  return "custom_event";
}

function defaultParams(event: ApprovedEvent) {
  const fromTemplate = event.properties
    .filter((p) => p.propertyName !== "event_code")
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.propertyName] = p.exampleValue || "";
      return acc;
    }, {});

  return {
    event_source: event.sourceType,
    trigger_type: event.triggerType || "unknown",
    priority_hint: event.status,
    ...fromTemplate,
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

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const events = await prisma.event.findMany({
      where: {
        projectId: id,
        status: { in: ["approved", "ready_for_dev"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        eventName: true,
        description: true,
        triggerType: true,
        triggerCondition: true,
        sourceType: true,
        status: true,
        properties: {
          select: {
            propertyName: true,
            propertyType: true,
            exampleValue: true,
            isRequired: true,
          },
        },
      },
    });

    if (events.length === 0) {
      return NextResponse.json({ error: "No approved events found" }, { status: 400 });
    }

    const approvedEvents = events as ApprovedEvent[];

    const packageJson = {
      schemaVersion: "gtm_recipe_v1",
      generatedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        targetUrl: project.targetUrl,
        analysisGoal: project.analysisGoal,
      },
      summary: {
        approvedEventCount: approvedEvents.length,
        ga4RecommendedCount: approvedEvents.filter((e) => e.sourceType === "ga4_recommended").length,
        customEventCount: approvedEvents.filter((e) => e.sourceType !== "ga4_recommended").length,
      },
      gtmSetupChecklist: [
        "GA4 Configuration tag must exist and fire on all pages.",
        "Create a Custom Event trigger for each event_name listed below.",
        "Create a GA4 Event tag mapped 1:1 to each event_name.",
        "Use the provided event parameters as defaults and extend as needed.",
        "Preview and validate in GTM Preview + GA4 DebugView before publish.",
      ],
      dataLayerContract: approvedEvents.map((event) => ({
        event: event.eventName,
        triggerType: inferTriggerType(event),
        description: event.description || "",
        recommendedParams: defaultParams(event),
      })),
      gtmDraft: {
        triggers: approvedEvents.map((event) => ({
          triggerName: `CE - ${event.eventName}`,
          triggerType: "Custom Event",
          customEventName: event.eventName,
          notes: event.triggerCondition || "",
        })),
        ga4EventTags: approvedEvents.map((event) => ({
          tagName: `GA4 - ${event.eventName}`,
          eventName: event.eventName,
          triggerRef: `CE - ${event.eventName}`,
          eventParams: defaultParams(event),
        })),
      },
    };

    const filename = `gtm_recipe_${sanitizeName(project.name)}.json`;

    const response = new NextResponse(JSON.stringify(packageJson, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
    await logActivity({
      name: "export_downloaded",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { format: "gtm_json" },
    });
    return response;
  } catch (error) {
    console.error("Export GTM JSON Error:", error);
    return NextResponse.json({ error: "Failed to export GTM package" }, { status: 500 });
  }
}
