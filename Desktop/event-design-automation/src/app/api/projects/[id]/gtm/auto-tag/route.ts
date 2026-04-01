import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { GTM_ACCESS_TOKEN_COOKIE, parseCookieHeader } from "@/lib/gtmOAuth";

type GtmConfig = {
  accessToken: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  ga4MeasurementId: string;
  amplitudeApiKey: string;
};

type AutoTagRequestBody = {
  accessToken?: string;
  gtmAccountId?: string;
  gtmContainerId?: string;
  gtmWorkspaceId?: string;
  ga4MeasurementId?: string;
  amplitudeApiKey?: string;
  persistConfig?: boolean;
};

type ApprovedEvent = {
  eventName: string;
  triggerType: string | null;
  properties: Array<{
    propertyName: string;
    propertyType: string;
    exampleValue: string | null;
    isRequired: boolean;
  }>;
};

class GtmApiError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`GTM API ${status}: ${details}`);
    this.status = status;
    this.details = details;
  }
}

function getMissingConfig(config: Partial<GtmConfig>, toolType: string) {
  const missing: string[] = [];
  if (!config.accessToken) missing.push("GTM_OAUTH_CONNECTION");
  if (!config.accountId) missing.push("GTM_ACCOUNT_ID");
  if (!config.containerId) missing.push("GTM_CONTAINER_ID");
  if (!config.workspaceId) missing.push("GTM_WORKSPACE_ID");
  if (toolType === "amplitude") {
    if (!config.amplitudeApiKey) missing.push("AMPLITUDE_API_KEY");
  } else {
    if (!config.ga4MeasurementId) missing.push("GTM_GA4_MEASUREMENT_ID");
  }
  return missing;
}

function buildWorkspacePath(config: GtmConfig) {
  return `accounts/${config.accountId}/containers/${config.containerId}/workspaces/${config.workspaceId}`;
}

async function gtmFetch<T>(
  config: GtmConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GtmApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

function buildTriggerPayload(eventName: string) {
  return {
    name: `CE - ${eventName}`,
    type: "customEvent",
    customEventFilter: [
      {
        type: "equals",
        parameter: [
          { type: "template", key: "arg0", value: "{{_event}}" },
          { type: "template", key: "arg1", value: eventName },
        ],
      },
    ],
  };
}

function buildGa4TagPayload(eventName: string, triggerId: string, config: GtmConfig) {
  return {
    name: `GA4 - ${eventName}`,
    type: "gaawe",
    firingTriggerId: [triggerId],
    parameter: [
      {
        type: "template",
        key: "eventName",
        value: eventName,
      },
      {
        type: "template",
        key: "measurementIdOverride",
        value: config.ga4MeasurementId,
      },
    ],
  };
}

function buildAmplitudeHtmlTagPayload(eventName: string, triggerId: string, config: GtmConfig) {
  const html = `<script>
  (function(){
    window.amplitudeQueue = window.amplitudeQueue || [];
    function track(){ window.amplitudeQueue.push(arguments); }
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://cdn.amplitude.com/libs/analytics-browser-2.11.10-min.js.gz";
    s.onload = function(){
      if (window.amplitude && window.amplitude.init) {
        window.amplitude.init("${config.amplitudeApiKey}");
        window.amplitude.track("${eventName}");
      } else {
        track("track", "${eventName}");
      }
    };
    document.head.appendChild(s);
  })();
</script>`;

  return {
    name: `AMP - ${eventName}`,
    type: "html",
    firingTriggerId: [triggerId],
    parameter: [
      {
        type: "template",
        key: "html",
        value: html,
      },
      {
        type: "boolean",
        key: "supportDocumentWrite",
        value: "false",
      },
    ],
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await request.json().catch(() => ({}))) as AutoTagRequestBody;
    const params = await context.params;
    const { id } = params;

    const access = await requireProjectAccess(id, { write: true });
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const events = await prisma.event.findMany({
      where: {
        projectId: id,
        status: { in: ["approved", "ready_for_dev"] },
      },
      include: {
        properties: {
          select: {
            propertyName: true,
            propertyType: true,
            exampleValue: true,
            isRequired: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (events.length === 0) {
      return NextResponse.json({ error: "No approved events found" }, { status: 400 });
    }

    const normalizedToolType = project.toolType === "amplitude" ? "amplitude" : "ga4";

    const cookieMap = parseCookieHeader(request.headers.get("cookie"));
    const oauthAccessToken = cookieMap[GTM_ACCESS_TOKEN_COOKIE] || "";

    const configCandidate: Partial<GtmConfig> = {
      accessToken: body.accessToken?.trim() || oauthAccessToken || process.env.GTM_ACCESS_TOKEN,
      accountId: body.gtmAccountId?.trim() || project.gtmAccountId || process.env.GTM_ACCOUNT_ID,
      containerId: body.gtmContainerId?.trim() || project.gtmContainerId || process.env.GTM_CONTAINER_ID,
      workspaceId: body.gtmWorkspaceId?.trim() || project.gtmWorkspaceId || process.env.GTM_WORKSPACE_ID,
      ga4MeasurementId: body.ga4MeasurementId?.trim() || project.ga4MeasurementId || process.env.GTM_GA4_MEASUREMENT_ID,
      amplitudeApiKey: body.amplitudeApiKey?.trim() || project.amplitudeApiKey || process.env.AMPLITUDE_API_KEY,
    };

    const missing = getMissingConfig(configCandidate, normalizedToolType);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "GTM config is missing",
          missing,
          message: "Connect Google GTM OAuth and fill required GTM IDs before auto-tagging.",
        },
        { status: 400 }
      );
    }

    const config = configCandidate as GtmConfig;

    if (body.persistConfig) {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          gtmAccountId: config.accountId,
          gtmContainerId: config.containerId,
          gtmWorkspaceId: config.workspaceId,
          ga4MeasurementId: config.ga4MeasurementId,
          amplitudeApiKey: config.amplitudeApiKey,
        },
      });
    }

    const workspacePath = buildWorkspacePath(config);

    const triggerList = await gtmFetch<{ trigger?: Array<{ triggerId: string; name: string }> }>(
      config,
      `${workspacePath}/triggers`
    );
    const tagList = await gtmFetch<{ tag?: Array<{ tagId: string; name: string }> }>(
      config,
      `${workspacePath}/tags`
    );

    const triggerMap = new Map((triggerList.trigger || []).map((t) => [t.name, t]));
    const tagMap = new Map((tagList.tag || []).map((t) => [t.name, t]));

    let createdTriggers = 0;
    let createdTags = 0;
    let skippedTriggers = 0;
    let skippedTags = 0;

    for (const event of events as ApprovedEvent[]) {
      const triggerName = `CE - ${event.eventName}`;
      const tagName = normalizedToolType === "amplitude" ? `AMP - ${event.eventName}` : `GA4 - ${event.eventName}`;

      let triggerId = triggerMap.get(triggerName)?.triggerId;

      if (!triggerId) {
        const createdTrigger = await gtmFetch<{ triggerId: string; name: string }>(
          config,
          `${workspacePath}/triggers`,
          {
            method: "POST",
            body: JSON.stringify(buildTriggerPayload(event.eventName)),
          }
        );
        triggerId = createdTrigger.triggerId;
        triggerMap.set(createdTrigger.name, createdTrigger);
        createdTriggers += 1;
      } else {
        skippedTriggers += 1;
      }

      if (!tagMap.has(tagName)) {
        const createdTag = await gtmFetch<{ tagId: string; name: string }>(
          config,
          `${workspacePath}/tags`,
          {
            method: "POST",
            body: JSON.stringify(
              normalizedToolType === "amplitude"
                ? buildAmplitudeHtmlTagPayload(event.eventName, triggerId, config)
                : buildGa4TagPayload(event.eventName, triggerId, config)
            ),
          }
        );
        tagMap.set(createdTag.name, createdTag);
        createdTags += 1;
      } else {
        skippedTags += 1;
      }
    }

    return NextResponse.json({
      success: true,
      projectId: project.id,
      toolType: normalizedToolType,
      approvedEvents: events.length,
      result: {
        createdTriggers,
        skippedTriggers,
        createdTags,
        skippedTags,
      },
    });
  } catch (error) {
    console.error("GTM Auto Tag Error:", error);
    if (error instanceof GtmApiError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json(
        {
          error: "GTM authentication failed",
          status: error.status,
          message:
            "Google OAuth access token is invalid or expired. Re-issue GTM access token with Tag Manager scope and retry.",
          details: error.details,
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to auto-tag in GTM" },
      { status: 500 }
    );
  }
}
