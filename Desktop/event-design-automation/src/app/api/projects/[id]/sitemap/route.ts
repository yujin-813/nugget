import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type SitemapNode = {
  id: string;
  url: string;
  title: string;
};

type SitemapEdge = {
  fromPageId: string;
  toPageId: string;
};

type SitemapPayload = {
  nodes: SitemapNode[];
  edges: SitemapEdge[];
};

function normalizeNodeId(rawId: string, fallbackSeed: string) {
  const normalized = (rawId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized.length > 0) return normalized;
  const seed = fallbackSeed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `custom_${seed || Date.now().toString()}`;
}

function normalizeUrl(input: string) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function normalizeComparableUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${pathname}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function buildAutoSitemap(project: {
  pages: Array<{
    id: string;
    url: string;
    title: string | null;
    components: Array<{ componentType: string; label: string | null; metadataJson: string | null }>;
  }>;
}): SitemapPayload {
  const nodes: SitemapNode[] = project.pages.map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title || "Untitled",
  }));

  const pageUrlToId = new Map(nodes.map((node) => [normalizeComparableUrl(node.url), node.id]));
  const dedupEdges = new Map<string, SitemapEdge>();
  const dedupNodes = new Map<string, SitemapNode>(nodes.map((node) => [node.id, node]));

  project.pages.forEach((page) => {
    page.components
      .filter((component) => component.componentType === "interaction")
      .forEach((component, index) => {
        const metadata = parseJson<{ actionType?: string; resolvedDestination?: string | null; destination?: string | null }>(
          component.metadataJson,
          {}
        );
        const actionType = metadata.actionType || "";
        const resolvedDestination = metadata.resolvedDestination || metadata.destination || "";

        if (actionType === "navigate" && resolvedDestination) {
          const toPageId = pageUrlToId.get(normalizeComparableUrl(resolvedDestination));
          if (toPageId && toPageId !== page.id) {
            const key = `${page.id}->${toPageId}`;
            if (!dedupEdges.has(key)) {
              dedupEdges.set(key, {
                fromPageId: page.id,
                toPageId,
              });
            }
          }
          return;
        }

        if (actionType === "open_popup" || actionType === "open_modal") {
          const popupId = `popup_${page.id}_${index + 1}`;
          const popupTitle = component.label?.trim() || "Popup";
          if (!dedupNodes.has(popupId)) {
            dedupNodes.set(popupId, {
              id: popupId,
              url: resolvedDestination || `${page.url}#popup-${index + 1}`,
              title: popupTitle,
            });
          }
          const edgeKey = `${page.id}->${popupId}`;
          if (!dedupEdges.has(edgeKey)) {
            dedupEdges.set(edgeKey, {
              fromPageId: page.id,
              toPageId: popupId,
            });
          }
        }
      });
  });

  return {
    nodes: Array.from(dedupNodes.values()),
    edges: Array.from(dedupEdges.values()),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        pages: {
          include: {
              components: {
                select: {
                  componentType: true,
                  label: true,
                  metadataJson: true,
                },
              },
          },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const auto = buildAutoSitemap(project);
    const override = parseJson<SitemapPayload | null>(project.sitemapOverrideJson, null);

    return NextResponse.json({
      source: override ? "override" : "auto",
      sitemap: override || auto,
      autoSitemap: auto,
    });
  } catch (error) {
    console.error("GET Sitemap Error:", error);
    return NextResponse.json({ error: "Failed to fetch sitemap" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Partial<SitemapPayload> & {
      reset?: boolean;
    };

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        pages: {
          select: {
            id: true,
            url: true,
            title: true,
          },
        },
      },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    if (body.reset) {
      await prisma.project.update({
        where: { id },
        data: { sitemapOverrideJson: null },
      });
      return NextResponse.json({ success: true, source: "auto" });
    }

    const pageById = new Map(project.pages.map((page) => [page.id, page]));
    const validNodesMap = new Map<string, SitemapNode>();

    project.pages.forEach((page) => {
      validNodesMap.set(page.id, {
        id: page.id,
        url: page.url,
        title: page.title || "Untitled",
      });
    });

    const inputNodes = Array.isArray(body.nodes) ? body.nodes : [];
    inputNodes.forEach((node, index) => {
      const rawUrl = node?.url || "";
      const url = normalizeUrl(rawUrl);
      if (!url) return;
      const title = (node?.title || "").trim() || "Untitled";
      const idSeed = title || `node_${index + 1}`;
      let id = normalizeNodeId(node?.id || "", idSeed);
      if (pageById.has(id)) {
        validNodesMap.set(id, {
          id,
          url: pageById.get(id)?.url || url,
          title: pageById.get(id)?.title || title,
        });
      } else {
        if (!id.startsWith("custom_")) id = `custom_${id}`;
        validNodesMap.set(id, { id, url, title });
      }
    });

    const validNodes: SitemapNode[] = Array.from(validNodesMap.values());
    const nodeIdSet = new Set(validNodes.map((node) => node.id));

    const dedupEdge = new Map<string, SitemapEdge>();
    const inputEdges = Array.isArray(body.edges) ? body.edges : [];
    inputEdges.forEach((edge) => {
      const fromPageId = edge?.fromPageId;
      const toPageId = edge?.toPageId;
      if (!fromPageId || !toPageId) return;
      if (!nodeIdSet.has(fromPageId) || !nodeIdSet.has(toPageId)) return;
      if (fromPageId === toPageId) return;
      const key = `${fromPageId}->${toPageId}`;
      if (!dedupEdge.has(key)) {
        dedupEdge.set(key, { fromPageId, toPageId });
      }
    });

    const sitemap: SitemapPayload = {
      nodes: validNodes,
      edges: Array.from(dedupEdge.values()),
    };

    await prisma.project.update({
      where: { id },
      data: {
        sitemapOverrideJson: JSON.stringify(sitemap),
      },
    });

    return NextResponse.json({
      success: true,
      source: "override",
      sitemap,
    });
  } catch (error) {
    console.error("PUT Sitemap Error:", error);
    return NextResponse.json({ error: "Failed to save sitemap override" }, { status: 500 });
  }
}
