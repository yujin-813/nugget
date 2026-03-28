import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import type { Element as DomHandlerElement } from "domhandler";

type ComponentDraft = {
  pageId: string;
  componentType: string;
  label: string;
  selector?: string;
  metadataJson?: string;
};

type CrawledPage = {
  url: string;
  title: string;
  html: string;
  discoveredLinks: string[];
};

const MAX_ANALYZE_PAGES = 8;
const MAX_DISCOVER_LINKS_PER_PAGE = 40;
const MAX_INTERACTIVE_CLICKS_PER_PAGE = 10;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function safeText(value: string | undefined, fallback: string) {
  const normalized = normalizeWhitespace(value || "");
  return normalized.length > 0 ? normalized : fallback;
}

function clamp(value: string, max = 120) {
  return value.substring(0, max).trim();
}

function normalizeUrlForCrawl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function toSameOriginUrl(href: string | null | undefined, currentUrl: string, origin: string) {
  if (!href) return null;
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }

  try {
    const absolute = new URL(raw, currentUrl);
    if (absolute.origin !== origin) return null;
    absolute.hash = "";
    if (absolute.pathname.length > 1 && absolute.pathname.endsWith("/")) {
      absolute.pathname = absolute.pathname.slice(0, -1);
    }
    return absolute.toString();
  } catch {
    return null;
  }
}

function extractInternalLinks($: cheerio.CheerioAPI, pageUrl: string, origin: string) {
  const links = new Set<string>();
  $("a[href], area[href], form[action]").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const raw = tag === "form" ? $(element).attr("action") : $(element).attr("href");
    const normalized = toSameOriginUrl(raw, pageUrl, origin);
    if (normalized) links.add(normalized);
  });
  return Array.from(links).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
}

async function extractInternalLinksFromBrowser(page: Page, pageUrl: string, origin: string) {
  try {
    const candidates = await page.evaluate(() => {
      const values = new Set<string>();
      const add = (value: string | null | undefined) => {
        if (!value) return;
        const v = String(value).trim();
        if (!v) return;
        values.add(v);
      };

      document.querySelectorAll("a[href], area[href]").forEach((el) => {
        add((el as HTMLAnchorElement).getAttribute("href"));
      });
      document.querySelectorAll("form[action]").forEach((el) => {
        add((el as HTMLFormElement).getAttribute("action"));
      });
      document.querySelectorAll("[data-href], [data-url], [onclick]").forEach((el) => {
        add(el.getAttribute("data-href"));
        add(el.getAttribute("data-url"));
        const onclick = el.getAttribute("onclick") || "";
        const match = onclick.match(/(https?:\/\/[^'"`\s)]+|\/[^'"`\s)]+)/i);
        if (match?.[1]) add(match[1]);
      });
      return Array.from(values);
    });

    const links = new Set<string>();
    candidates.forEach((candidate) => {
      const normalized = toSameOriginUrl(candidate, pageUrl, origin);
      if (normalized) links.add(normalized);
    });
    return Array.from(links).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
  } catch {
    return [];
  }
}

async function extractInternalLinksByClicks(page: Page, pageUrl: string, origin: string) {
  const discovered = new Set<string>();
  try {
    const selectors = await page.evaluate((maxClicks) => {
      const isVisible = (el: Element) => {
        const rect = (el as HTMLElement).getBoundingClientRect?.();
        if (!rect) return false;
        if (rect.width < 8 || rect.height < 8) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };

      const score = (el: Element) => {
        const text = `${(el.textContent || "").trim()} ${(el.getAttribute("aria-label") || "")}`.toLowerCase();
        const classId = `${el.className || ""} ${el.id || ""}`.toLowerCase();
        let s = 0;
        if (text.length > 0) s += 1;
        if (/menu|nav|gnb|header|서비스|소개|문의|가입|시작|플랜|요금|about|contact|pricing|login|sign/.test(text)) s += 3;
        if (/menu|nav|gnb|header/.test(classId)) s += 2;
        return s;
      };

      const candidates = Array.from(
        document.querySelectorAll("a, button, [role='button'], [onclick], [data-href], [data-url]")
      )
        .filter(isVisible)
        .map((el, index) => {
          (el as HTMLElement).setAttribute("data-crawl-idx", String(index));
          return { selector: `[data-crawl-idx="${index}"]`, score: score(el) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, maxClicks * 2);

      const dedup = new Set<string>();
      const result: string[] = [];
      for (const candidate of candidates) {
        if (!dedup.has(candidate.selector)) {
          dedup.add(candidate.selector);
          result.push(candidate.selector);
        }
        if (result.length >= maxClicks) break;
      }
      return result;
    }, MAX_INTERACTIVE_CLICKS_PER_PAGE);

    for (const selector of selectors) {
      const beforeUrl = page.url();
      const maybeNav = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 1200 }).catch(() => null);
      await page.click(selector).catch(() => null);
      await Promise.race([maybeNav, new Promise((resolve) => setTimeout(resolve, 900))]);
      const afterUrl = page.url();

      const normalized = toSameOriginUrl(afterUrl, beforeUrl, origin);
      if (normalized && normalized !== pageUrl) {
        discovered.add(normalized);
      }

      if (afterUrl !== beforeUrl) {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 2000 }).catch(() => null);
        await neutralizeBlockingPopups(page);
      }
    }
  } catch {
    return [];
  }

  return Array.from(discovered).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
}

function parseUrlStructure(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
      pathSegments: parsed.pathname.split("/").filter(Boolean),
      queryKeys: Array.from(parsed.searchParams.keys()),
      hash: parsed.hash || null,
    };
  } catch {
    return {
      origin: null,
      pathname: rawUrl,
      pathSegments: [],
      queryKeys: [],
      hash: null,
    };
  }
}

function isLikelyRollingBanner(className: string, id: string) {
  const haystack = `${className} ${id}`.toLowerCase();
  return /(banner|carousel|slider|swiper|rolling|hero)/.test(haystack);
}

function extractMeaningfulToken(className: string, id: string) {
  const source = `${id} ${className}`.trim();
  if (!source) return "";

  const tokens = source
    .split(/\s+/)
    .map((t) => t.replace(/__[A-Za-z0-9]+$/, ""))
    .map((t) => t.replace(/_[A-Za-z0-9]{4,}$/, ""))
    .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean);

  const utilityLike = /^(w-|h-|m[trblxy]?|p[trblxy]?|text-|font-|flex|grid|block|hidden|items-|justify-|max-|min-|lg:|md:|sm:)/;
  const meaningful = tokens.find((t) => !utilityLike.test(t));
  return meaningful || tokens[0] || "";
}

function classifyInfoBlock(
  tagName: string,
  className: string,
  id: string,
  heading: string,
  linkCount: number,
  buttonCount: number
) {
  const haystack = `${tagName} ${className} ${id} ${heading}`.toLowerCase();
  if (tagName === "header" || /\bgnb\b|\bnav\b|navigation|header/.test(haystack)) return "navigation";
  if (tagName === "footer" || /footer/.test(haystack)) return "footer";
  if (isLikelyRollingBanner(className, id)) return "hero_banner";
  if (buttonCount > 0 && /start|sign|join|buy|contact|문의|신청|가입|구매/.test(haystack)) return "cta_section";
  if (/card|feature|benefit|service|icon/.test(haystack) || linkCount + buttonCount >= 3) return "feature_section";
  return "content_section";
}

function shouldKeepInfoBlock(
  tagName: string,
  linkCount: number,
  buttonCount: number,
  subsectionCount: number,
  heading: string
) {
  if (["header", "main", "section", "article", "footer", "nav"].includes(tagName)) return true;
  if (heading.length > 0) return true;
  if (linkCount + buttonCount >= 2) return true;
  return subsectionCount >= 2;
}

function inferInteractionAction($: cheerio.CheerioAPI, element: DomHandlerElement) {
  const $el = $(element);
  const tag = element.tagName.toLowerCase();
  const href = $el.attr("href") || null;
  const onclick = ($el.attr("onclick") || "").toLowerCase();
  const target = ($el.attr("target") || "").toLowerCase();
  const ariaHaspopup = ($el.attr("aria-haspopup") || "").toLowerCase();
  const dataToggle = ($el.attr("data-toggle") || $el.attr("data-bs-toggle") || "").toLowerCase();
  const className = ($el.attr("class") || "").toLowerCase();
  const hasDownloadAttr = $el.attr("download") !== undefined;

  if (tag === "form") {
    return {
      actionType: "form_submit",
      destination: $el.attr("action") || "unknown",
      confidence: "high",
    };
  }

  if (hasDownloadAttr || (href && /\.(pdf|csv|xlsx|zip|pptx?)($|\?)/i.test(href))) {
    return {
      actionType: "download",
      destination: href,
      confidence: "high",
    };
  }

  if (dataToggle.includes("modal") || /modal/.test(className) || onclick.includes("modal")) {
    return {
      actionType: "open_modal",
      destination: $el.attr("data-bs-target") || $el.attr("data-target") || href || null,
      confidence: "medium",
    };
  }

  if (dataToggle.includes("dropdown") || ariaHaspopup === "true" || /dropdown/.test(className)) {
    return {
      actionType: "open_dropdown",
      destination: null,
      confidence: "medium",
    };
  }

  if (onclick.includes("window.open") || target === "_blank") {
    return {
      actionType: "open_popup",
      destination: href,
      confidence: "medium",
    };
  }

  if (href) {
    return {
      actionType: "navigate",
      destination: href,
      confidence: "high",
    };
  }

  return {
    actionType: "trigger_ui",
    destination: null,
    confidence: "low",
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Failed to analyze URL";
}

async function updateJob(jobId: string, data: Record<string, unknown>) {
  await prisma.analyzeJob.update({ where: { id: jobId }, data });
}

async function neutralizeBlockingPopups(page: Page) {
  try {
    await page.keyboard.press("Escape").catch(() => {});

    await page.evaluate(() => {
      const closeKeywords = [
        "close",
        "dismiss",
        "skip",
        "cancel",
        "later",
        "not now",
        "닫기",
        "나중에",
        "취소",
        "건너뛰기",
        "x",
      ];
      const overlayKeywords = [
        "popup",
        "modal",
        "dialog",
        "overlay",
        "backdrop",
        "cookie",
        "consent",
        "newsletter",
        "subscribe",
        "팝업",
        "모달",
        "배너",
        "쿠키",
      ];

      const safeClick = (el: Element | null) => {
        if (!el) return;
        if (!(el instanceof HTMLElement)) return;
        try {
          el.click();
        } catch {}
      };

      const getText = (el: any) =>
        `${el.textContent || ""} ${(el.getAttribute("aria-label") || "")}`.toLowerCase();

      const closeCandidates = Array.from(
        document.querySelectorAll(
          "button, [role='button'], [aria-label], .close, .btn-close, [data-dismiss], [data-bs-dismiss]"
        )
      );
      closeCandidates.forEach((el) => {
        const text = getText(el);
        if (closeKeywords.some((keyword) => text.includes(keyword))) {
          safeClick(el);
        }
      });

      const overlays = Array.from(
        document.querySelectorAll(
          "[role='dialog'], .modal, .popup, .overlay, .backdrop, .cookie, .consent, [class*='modal'], [class*='popup'], [class*='overlay']"
        )
      );
      overlays.forEach((el) => {
        const text = getText(el);
        const classId = `${el.className || ""} ${el.id || ""}`.toLowerCase();
        const style = window.getComputedStyle(el as Element);
        const zIndex = Number(style.zIndex || 0);
        const isFixedLayer = style.position === "fixed" || style.position === "sticky";
        const likelyOverlay =
          overlayKeywords.some((keyword) => text.includes(keyword) || classId.includes(keyword)) ||
          (isFixedLayer && zIndex >= 1000);
        if (!likelyOverlay) return;
        if (el instanceof HTMLElement) {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("pointer-events", "none", "important");
        }
      });

      const html = document.documentElement;
      const body = document.body;
      if (html) {
        html.style.setProperty("overflow", "auto", "important");
      }
      if (body) {
        body.style.setProperty("overflow", "auto", "important");
        body.style.setProperty("position", "static", "important");
      }
    });
  } catch (error) {
    console.warn("Popup neutralization failed", error);
  }
}

async function runAnalyzePipeline(projectId: string, targetUrl: string, jobId: string) {
  await updateJob(jobId, {
    status: "running",
    startedAt: new Date(),
    progress: 10,
    errorMessage: null,
  });

  const normalizedTargetUrl = normalizeUrlForCrawl(targetUrl);
  const origin = new URL(normalizedTargetUrl).origin;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const queue: string[] = [normalizedTargetUrl];
  const queued = new Set<string>([normalizedTargetUrl]);
  const visited = new Set<string>();
  const crawledPages: CrawledPage[] = [];

  try {
    while (queue.length > 0 && crawledPages.length < MAX_ANALYZE_PAGES) {
      const nextUrl = queue.shift();
      if (!nextUrl || visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      let page: Page | null = null;
      try {
        page = await browser.newPage();
        page.on("dialog", async (dialog) => {
          try {
            await dialog.dismiss();
          } catch {}
        });

        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        );

        await page
          .goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
          .catch((e) => console.warn("Goto timeout; proceeding with captured DOM", e));

        await neutralizeBlockingPopups(page);

        await new Promise((resolve) => setTimeout(resolve, 300));
        const html = await page.content();
        const $ = cheerio.load(html);
        const title = safeText($("title").text(), nextUrl);
        const staticLinks = extractInternalLinks($, nextUrl, origin);
        const browserLinks = await extractInternalLinksFromBrowser(page, nextUrl, origin);
        const interactiveLinks = await extractInternalLinksByClicks(page, nextUrl, origin);
        const discoveredLinks = Array.from(new Set([...staticLinks, ...browserLinks, ...interactiveLinks])).slice(
          0,
          MAX_DISCOVER_LINKS_PER_PAGE
        );

        discoveredLinks.forEach((link) => {
          if (!visited.has(link) && !queued.has(link) && queue.length + crawledPages.length < MAX_ANALYZE_PAGES * 4) {
            queue.push(link);
            queued.add(link);
          }
        });

        crawledPages.push({
          url: nextUrl,
          title,
          html,
          discoveredLinks,
        });

        const progress = 10 + Math.round((crawledPages.length / MAX_ANALYZE_PAGES) * 35);
        await updateJob(jobId, { progress: Math.min(progress, 45) });
      } catch (crawlError) {
        console.warn("Crawl page error, continuing:", nextUrl, crawlError);
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (crawledPages.length === 0) {
    throw new Error("No pages crawled from target URL");
  }

  await prisma.component.deleteMany({ where: { page: { projectId } } });
  await prisma.page.deleteMany({ where: { projectId } });

  const drafts: ComponentDraft[] = [];
  const pageRecords = await prisma.$transaction(
    crawledPages.map((crawledPage, index) =>
      prisma.page.create({
        data: {
          projectId,
          url: crawledPage.url,
          title: crawledPage.title,
          pageType: index === 0 ? "main" : "sub",
        },
      })
    )
  );
  const pageIdByUrl = new Map(pageRecords.map((record) => [record.url, record.id]));

  await updateJob(jobId, { progress: 60 });

  crawledPages.forEach((crawledPage) => {
    const pageId = pageIdByUrl.get(crawledPage.url);
    if (!pageId) return;
    const $ = cheerio.load(crawledPage.html);
    const urlStructure = parseUrlStructure(crawledPage.url);

    drafts.push({
      pageId,
      componentType: "url",
      label: clamp(`URL: ${urlStructure.pathname || "/"}`),
      metadataJson: JSON.stringify({ stage: "step1_information_architecture", ...urlStructure }),
    });

    const gnbCandidates = $("header nav, nav.gnb, nav[role='navigation']");
    if (gnbCandidates.length > 0) {
      drafts.push({
        pageId,
        componentType: "info_block",
        label: "GNB",
        selector: "nav",
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          blockKind: "gnb",
          menuCount: gnbCandidates.first().find("a").length,
        }),
      });
    }

    const topBlock = $("header, main, section, article, footer, nav, main > div").slice(0, 60);
    topBlock.each((index, el) => {
      const tagName = el.tagName.toLowerCase();
      const className = $(el).attr("class") || "";
      const idValue = $(el).attr("id") || "";
      const heading = safeText($(el).find("h1, h2, h3").first().text(), "");
      const linkCount = $(el).find("a").length;
      const buttonCount = $(el).find("button, [role='button'], input[type='submit'], input[type='button']").length;
      const subsectionCount = $(el).children("section, article, div").length;
      const meaningfulToken = extractMeaningfulToken(className, idValue);

      if (!shouldKeepInfoBlock(tagName, linkCount, buttonCount, subsectionCount, heading)) return;

      const blockKind = classifyInfoBlock(tagName, className, idValue, heading, linkCount, buttonCount);
      const semanticTitle = heading || meaningfulToken || `${blockKind}_${index + 1}`;
      const blockLabel = `${index + 1}. ${blockKind}: ${semanticTitle}`;

      drafts.push({
        pageId,
        componentType: "info_block",
        label: clamp(blockLabel),
        selector: tagName,
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          blockKind,
          order: index + 1,
          heading: heading || null,
          semanticTitle,
          meaningfulToken: meaningfulToken || null,
          linkCount,
          buttonCount,
          subsectionCount,
        }),
      });
    });

    $("a, button, [role='button'], input[type='button'], input[type='submit'], form").each((_, el) => {
      const action = inferInteractionAction($, el);
      const href = $(el).attr("href") || $(el).attr("action") || null;
      const resolvedDestination =
        toSameOriginUrl(action.destination, crawledPage.url, origin) ||
        toSameOriginUrl(href, crawledPage.url, origin);
      const label = safeText(
        $(el).text() || $(el).attr("aria-label") || $(el).attr("value"),
        el.tagName.toLowerCase() === "form" ? "form" : "interaction"
      );

      drafts.push({
        pageId,
        componentType: "interaction",
        label: clamp(label),
        selector: el.tagName.toLowerCase(),
        metadataJson: JSON.stringify({
          stage: "step2_interaction_structure",
          actionType: action.actionType,
          destination: action.destination,
          resolvedDestination,
          href,
          confidence: action.confidence,
          id: $(el).attr("id") || null,
          className: $(el).attr("class") || null,
        }),
      });
    });

    $("h1, h2, h3, h4, h5, h6").each((_, el) => {
      drafts.push({
        pageId,
        componentType: "heading",
        label: clamp(safeText($(el).text(), "untitled heading")),
        selector: el.tagName,
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          level: Number(el.tagName.replace("h", "")) || null,
          id: $(el).attr("id") || null,
        }),
      });
    });
  });

  const deduped = new Map<string, ComponentDraft>();
  for (const draft of drafts) {
    const key = `${draft.componentType}-${(draft.label || "").toLowerCase().trim()}-${draft.selector || ""}`;
    if (!deduped.has(key)) deduped.set(key, draft);
  }

  const components = Array.from(deduped.values()).slice(0, MAX_ANALYZE_PAGES * 220);
  if (components.length > 0) {
    await prisma.component.createMany({ data: components });
  }

  const componentCountByPage = new Map<string, number>();
  components.forEach((component) => {
    componentCountByPage.set(component.pageId, (componentCountByPage.get(component.pageId) || 0) + 1);
  });

  const sitemapEdges = crawledPages.flatMap((page) => {
    const fromId = pageIdByUrl.get(page.url);
    if (!fromId) return [];
    return page.discoveredLinks
      .filter((target) => pageIdByUrl.has(target))
      .map((target) => ({
        fromPageId: fromId,
        toPageId: pageIdByUrl.get(target),
        fromUrl: page.url,
        toUrl: target,
      }));
  });

  const result = {
    pageCount: pageRecords.length,
    componentCount: components.length,
    infoBlockCount: components.filter((c) => c.componentType === "info_block").length,
    interactionCount: components.filter((c) => c.componentType === "interaction").length,
    pages: pageRecords.map((page) => ({
      id: page.id,
      title: page.title,
      url: page.url,
      pageType: page.pageType,
      componentCount: componentCountByPage.get(page.id) || 0,
    })),
    sitemap: {
      rootUrl: normalizedTargetUrl,
      edgeCount: sitemapEdges.length,
      edges: sitemapEdges,
    },
  };

  await updateJob(jobId, {
    status: "completed",
    progress: 100,
    completedAt: new Date(),
    resultJson: JSON.stringify(result),
  });

  return result;
}

async function processAnalyzeJob(jobId: string) {
  const job = await prisma.analyzeJob.findUnique({
    where: { id: jobId },
    include: { project: true },
  });

  if (!job || !job.project) return;

  try {
    await runAnalyzePipeline(job.projectId, job.project.targetUrl, job.id);
  } catch (error: unknown) {
    await updateJob(job.id, {
      status: "failed",
      progress: 100,
      completedAt: new Date(),
      errorMessage: getErrorMessage(error),
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const job = await prisma.analyzeJob.create({
      data: {
        projectId: id,
        status: "queued",
        progress: 0,
      },
    });

    setTimeout(() => {
      void processAnalyzeJob(job.id);
    }, 0);

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: job.status,
    });
  } catch (error: unknown) {
    console.error("Analyze Job Create Error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
