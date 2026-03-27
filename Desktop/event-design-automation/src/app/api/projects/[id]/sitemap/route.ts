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

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function buildAutoSitemap(project: {
  pages: Array<{
    id: string;
    url: string;
    title: string | null;
    components: Array<{ componentType: string; metadataJson: string | null }>;
  }>;
}): SitemapPayload {
  const nodes: SitemapNode[] = project.pages.map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title || "Untitled",
  }));

  const pageUrlToId = new Map(nodes.map((node) => [node.url, node.id]));
  const dedupEdges = new Map<string, SitemapEdge>();

  project.pages.forEach((page) => {
    page.components
      .filter((component) => component.componentType === "interaction")
      .forEach((component) => {
        const metadata = parseJson<{ actionType?: string; resolvedDestination?: string | null }>(
          component.metadataJson,
          {}
        );
        if (metadata.actionType !== "navigate" || !metadata.resolvedDestination) return;
        const toPageId = pageUrlToId.get(metadata.resolvedDestination);
        if (!toPageId || toPageId === page.id) return;

        const key = `${page.id}->${toPageId}`;
        if (!dedupEdges.has(key)) {
          dedupEdges.set(key, {
            fromPageId: page.id,
            toPageId,
          });
        }
      });
  });

  return {
    nodes,
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
    const validNodes: SitemapNode[] = project.pages.map((page) => ({
      id: page.id,
      url: page.url,
      title: page.title || "Untitled",
    }));

    const inputEdges = Array.isArray(body.edges) ? body.edges : [];
    const dedupEdge = new Map<string, SitemapEdge>();
    inputEdges.forEach((edge) => {
      const fromPageId = edge?.fromPageId;
      const toPageId = edge?.toPageId;
      if (!fromPageId || !toPageId) return;
      if (!pageById.has(fromPageId) || !pageById.has(toPageId)) return;
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

