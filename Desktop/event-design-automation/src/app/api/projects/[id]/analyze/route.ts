import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import type { Element as DomHandlerElement, ParentNode as DomHandlerParentNode } from "domhandler";

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

type SitemapOverrideNode = {
  id: string;
  url: string;
  title: string;
};

type SitemapOverridePayload = {
  nodes?: SitemapOverrideNode[];
};

const MAX_ANALYZE_PAGES = 20;
const MAX_DISCOVER_LINKS_PER_PAGE = 40;
const MAX_INTERACTIVE_CLICKS_PER_PAGE = 10;
const STRUCTURE_ONLY_ANALYSIS = true;
const ENABLE_INTERACTION_IN_STRUCTURE_MODE = true;
const INTENT_KEYWORD_REGEX = {
  convert:
    /(signup|sign.?up|register|join|login|lead|contact|inquiry|consult|purchase|checkout|buy|subscribe|trial|문의|상담|신청|가입|결제|구매|체험|구독)/i,
  evaluate:
    /(pricing|plan|feature|spec|detail|compare|review|demo|about|요금|플랜|기능|상세|비교|리뷰|소개|데모)/i,
  discover:
    /(home|main|menu|category|list|search|nav|탐색|메뉴|카테고리|목록|검색|네비)/i,
};

type ViewGraphNode = {
  id: string;
  pageId: string;
  nodeType: "page" | "view_state";
  label: string;
  url?: string;
};

type ViewGraphEdge = {
  from: string;
  to: string;
  edgeType: "navigate" | "state_change";
  actionType?: string;
};

type FlowCandidate = {
  id: string;
  intent: "discover" | "evaluate" | "convert";
  path: string[];
};

type QueueCandidate = {
  url: string;
  score: number;
  sourceUrl: string;
};

type CrawlDropReason =
  | "duplicate"
  | "queue_full"
  | "low_score"
  | "asset_url"
  | "social_external_like"
  | "policy_page";

type PageClassification = {
  pageId: string;
  url: string;
  title: string;
  pageType:
    | "main"
    | "plp"
    | "pdp"
    | "cart"
    | "checkout"
    | "purchase"
    | "login"
    | "sign_up"
    | "list"
    | "detail"
    | "search"
    | "form"
    | "complete"
    | "mypage"
    | "other";
  pageGoal: string;
  primaryCta: string | null;
  secondaryCta: string | null;
};

type SectionSummary = {
  sectionType: string;
  sectionLabel: string;
  sectionGoal: string;
  keyActions: string[];
};

type MenuStructureNode = {
  id: string;
  title: string;
  url: string | null;
  pageType?: string;
  children: MenuStructureNode[];
};

type MenuStructureSection = {
  sectionType: "top_nav" | "hamburger_menu" | "search_menu" | "menu_other";
  title: string;
  trees: MenuStructureNode[];
};

type MenuStructureResult = {
  sections: MenuStructureSection[];
  trees: MenuStructureNode[];
};

const ANALYZE_DEBUG = process.env.ANALYZE_DEBUG === "1";

function debugLog(label: string, payload: unknown) {
  if (!ANALYZE_DEBUG) return;
  console.log(label, payload);
}

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

function toSlug(value: string, fallback = "node") {
  const slug = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || fallback;
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

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getServiceDomain(hostname: string) {
  const parts = (hostname || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function isAllowedServiceHost(hostname: string, serviceDomain: string) {
  const host = (hostname || "").toLowerCase();
  const domain = (serviceDomain || "").toLowerCase();
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function toSameOriginUrl(
  href: string | null | undefined,
  currentUrl: string,
  origin: string,
  serviceDomain: string
) {
  if (!href) return null;
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }

  try {
    const absolute = new URL(raw, currentUrl);
    const sameOrigin = absolute.origin === origin;
    const sameService = isAllowedServiceHost(absolute.hostname, serviceDomain);
    if (!sameOrigin && !sameService) return null;
    absolute.hash = "";
    // Auth pages often include noisy redirect queries that create duplicate nodes.
    const pathLower = absolute.pathname.toLowerCase();
    if (/(^|\/)(login|signin|sign-in|sign_up|sign-up|signup|register|join)(\/|$)/.test(pathLower)) {
      absolute.search = "";
    } else {
      const dropKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ref", "source"];
      dropKeys.forEach((key) => absolute.searchParams.delete(key));
    }
    if (absolute.pathname.length > 1 && absolute.pathname.endsWith("/")) {
      absolute.pathname = absolute.pathname.slice(0, -1);
    }
    return absolute.toString();
  } catch {
    return null;
  }
}

function extractInternalLinks($: cheerio.CheerioAPI, pageUrl: string, origin: string, serviceDomain: string) {
  const links = new Set<string>();
  $("a[href], area[href], form[action]").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const raw = tag === "form" ? $(element).attr("action") : $(element).attr("href");
    const normalized = toSameOriginUrl(raw, pageUrl, origin, serviceDomain);
    if (normalized) links.add(normalized);
  });
  return Array.from(links).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
}

async function extractInternalLinksFromBrowser(page: Page, pageUrl: string, origin: string, serviceDomain: string) {
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
      const normalized = toSameOriginUrl(candidate, pageUrl, origin, serviceDomain);
      if (normalized) links.add(normalized);
    });
    return Array.from(links).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
  } catch {
    return [];
  }
}

async function extractInternalLinksByClicks(
  page: Page,
  pageUrl: string,
  origin: string,
  serviceDomain: string,
  maxClicks = MAX_INTERACTIVE_CLICKS_PER_PAGE
) {
  const discovered = new Set<string>();
  try {
    const selectors = await page.evaluate((clickBudget) => {
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
        document.querySelectorAll(
          "a, button, [role='button'], [onclick], [data-href], [data-url], [tabindex], [aria-controls], li, span, div"
        )
      )
        .filter(isVisible)
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const clickable =
            el.tagName.toLowerCase() === "a" ||
            el.tagName.toLowerCase() === "button" ||
            el.hasAttribute("onclick") ||
            el.hasAttribute("data-href") ||
            el.hasAttribute("data-url") ||
            el.getAttribute("role") === "button" ||
            el.getAttribute("role") === "tab" ||
            style.cursor === "pointer";
          return clickable;
        })
        .map((el, index) => {
          (el as HTMLElement).setAttribute("data-crawl-idx", String(index));
          return { selector: `[data-crawl-idx="${index}"]`, score: score(el) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, clickBudget * 2);

      const dedup = new Set<string>();
      const result: string[] = [];
      for (const candidate of candidates) {
        if (!dedup.has(candidate.selector)) {
          dedup.add(candidate.selector);
          result.push(candidate.selector);
        }
        if (result.length >= clickBudget) break;
      }
      return result;
    }, maxClicks);

    for (const selector of selectors) {
      const beforeUrl = page.url();
      const beforeState = await page
        .evaluate(() => ({
          url: location.href,
          title: document.title || "",
          anchors: document.querySelectorAll("a[href], [data-href], [data-url]").length,
          textLen: (document.body?.innerText || "").slice(0, 4000).length,
        }))
        .catch(() => ({ url: beforeUrl, title: "", anchors: 0, textLen: 0 }));
      let popupSettled = false;
      let resolvePopupWait: (() => void) | null = null;
      const settlePopup = () => {
        if (!popupSettled) {
          popupSettled = true;
          resolvePopupWait?.();
        }
      };
      const popupWait = new Promise<void>((resolve) => {
        resolvePopupWait = resolve;
      });
      const onPopup = async (popup: Page | null) => {
        if (!popup) {
          settlePopup();
          return;
        }
        try {
          await popup.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 1200 }).catch(() => null);
          const popupUrl = popup.url();
          const normalizedPopup = toSameOriginUrl(popupUrl, beforeUrl, origin, serviceDomain);
          if (normalizedPopup) {
            discovered.add(normalizedPopup);
          }
          const popupLinks = await extractInternalLinksFromBrowser(popup, popupUrl, origin, serviceDomain).catch(() => []);
          popupLinks.forEach((link) => discovered.add(link));
        } finally {
          await popup.close().catch(() => null);
          settlePopup();
        }
      };
      page.on("popup", onPopup);
      const popupTimer = setTimeout(() => settlePopup(), 1200);
      const maybeNav = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 1200 }).catch(() => null);
      await page.click(selector).catch(() => null);
      await Promise.race([maybeNav, popupWait, new Promise((resolve) => setTimeout(resolve, 1200))]);
      clearTimeout(popupTimer);
      page.off("popup", onPopup);
      const afterUrl = page.url();

      const normalized = toSameOriginUrl(afterUrl, beforeUrl, origin, serviceDomain);
      if (normalized && normalized !== pageUrl) {
        discovered.add(normalized);
      }

      // SPA fallback: URL unchanged but DOM changed; collect newly visible links after interaction.
      const afterState = await page
        .evaluate(() => ({
          url: location.href,
          title: document.title || "",
          anchors: document.querySelectorAll("a[href], [data-href], [data-url]").length,
          textLen: (document.body?.innerText || "").slice(0, 4000).length,
        }))
        .catch(() => beforeState);
      const domChanged =
        afterState.url !== beforeState.url ||
        afterState.title !== beforeState.title ||
        afterState.anchors !== beforeState.anchors ||
        Math.abs(afterState.textLen - beforeState.textLen) > 30;

      if (domChanged) {
        const afterLinks = await extractInternalLinksFromBrowser(page, page.url(), origin, serviceDomain);
        afterLinks.forEach((link) => discovered.add(link));
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

// Reserved for future interactive crawl passes.
void extractInternalLinksByClicks;

async function extractInternalLinksFromHamburgerMenu(
  page: Page,
  pageUrl: string,
  origin: string,
  serviceDomain: string
) {
  const discovered = new Set<string>();

  const collectVisibleMenuLinks = async () => {
    const links = await page.evaluate(() => {
      const hrefs = new Set<string>();
      const selectors = [
        ".bm-menu-wrap[aria-hidden='false'] a[href]",
        ".bm-item-list a[href]",
        ".hamburger-menu-wrapper a[href]",
        "nav a[href]",
      ];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          const href = (el as HTMLAnchorElement).getAttribute("href");
          if (href) hrefs.add(href);
        });
      });
      return Array.from(hrefs);
    });
    links.forEach((link) => {
      const normalized = toSameOriginUrl(link, pageUrl, origin, serviceDomain);
      if (normalized) discovered.add(normalized);
    });
  };

  try {
    const openerSelectors = [
      ".bm-burger-button button",
      "button[aria-label*='menu' i]",
      "button[aria-label*='메뉴']",
      "button[class*='hamburger']",
      "[class*='hamburger-menu'] button",
      "button[id*='menu']",
      "[data-testid*='menu']",
      "[class*='menu-button']",
    ];

    for (const selector of openerSelectors) {
      const exists = await page.$(selector);
      if (!exists) continue;
      await page.click(selector).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await collectVisibleMenuLinks();

      // Close menu if close button exists.
      const closeBtn = await page.$("button#react-burger-cross-btn, .bm-cross-button button, .bm-cross-button");
      if (closeBtn) {
        await closeBtn.click().catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  } catch {
    return [];
  }

  return Array.from(discovered).slice(0, MAX_DISCOVER_LINKS_PER_PAGE);
}

// Reserved for future interactive crawl passes.
void extractInternalLinksFromHamburgerMenu;

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

function labelFromUrlPath(url: string | null, fallback = "menu") {
  if (!url) return fallback;
  try {
    const path = new URL(url).pathname;
    if (path === "/") return "home";
    const seg = path.split("/").filter(Boolean).pop() || fallback;
    return decodeURIComponent(seg).replace(/[-_]+/g, " ");
  } catch {
    return fallback;
  }
}

function extractMenuTreesBySelectors(
  html: string,
  pageUrl: string,
  origin: string,
  serviceDomain: string,
  selectors: string,
  maxContainers = 6
): MenuStructureNode[] {
  const $ = cheerio.load(html);
  const containers = $(selectors).toArray().slice(0, maxContainers);
  if (containers.length === 0) return [];

  const pickAnchor = (node: DomHandlerElement) => {
    const direct = $(node).children("a[href]").first();
    if (direct.length > 0) return direct;
    const byLinkLike = $(node).find("a[href], [role='menuitem'][href]").first();
    return byLinkLike;
  };

  const collectChildItems = (node: DomHandlerElement) => {
    const childContainers = $(node)
      .children("ul, ol, nav, [role='menu'], [class*='sub'], [class*='dropdown'], [class*='children'], [class*='mega']")
      .toArray();
    const fromContainers = childContainers.flatMap((container) =>
      $(container)
        .children("li, [role='menuitem'], [class*='item'], [class*='menu-item'], a[href]")
        .toArray()
    );
    if (fromContainers.length > 0) return fromContainers as DomHandlerElement[];

    // Fallback for markup where submenu is nested deeper than immediate children.
    return $(node)
      .find(
        "> li, > [role='menuitem'], > [class*='item'], > [class*='menu-item'], > div > li, > div > a[href], > a[href]"
      )
      .toArray() as DomHandlerElement[];
  };

  const parseItem = (item: DomHandlerElement, depth: number): MenuStructureNode | null => {
    if (depth > 3) return null;
    const anchor = pickAnchor(item);
    const href = anchor.attr("href") || null;
    const normalized = toSameOriginUrl(href, pageUrl, origin, serviceDomain);
    const title = safeText(
      anchor.text() ||
        anchor.attr("aria-label") ||
        anchor.attr("title") ||
        $(item).attr("aria-label") ||
        $(item).attr("title"),
      ""
    );

    const childItems = collectChildItems(item);
    const children = childItems
      .map((child) => parseItem(child, depth + 1))
      .filter((child): child is MenuStructureNode => Boolean(child));

    if (!title && !normalized && children.length === 0) return null;
    const nodeTitle = clamp(title || labelFromUrlPath(normalized), 60);
    return {
      id: `menu_${toSlug(`${nodeTitle}_${normalized || depth}`, "node")}`,
      title: nodeTitle,
      url: normalized || null,
      children,
    };
  };

  const trees: MenuStructureNode[] = [];
  const seenTop = new Set<string>();

  containers.forEach((container) => {
    const topItems = $(container)
      .children("ul, ol")
      .first()
      .children("li, [role='menuitem'], [class*='item'], [class*='menu-item'], a[href]")
      .toArray() as DomHandlerElement[];

    if (topItems.length > 0) {
      topItems.forEach((item) => {
        const node = parseItem(item, 0);
        if (!node) return;
        const key = `${node.title}::${node.url || ""}`;
        if (seenTop.has(key)) return;
        seenTop.add(key);
        trees.push(node);
      });
      return;
    }

    const anchors = $(container).find("a[href]").toArray().slice(0, 20);
    anchors.forEach((anchorEl) => {
      const href = $(anchorEl).attr("href") || null;
      const normalized = toSameOriginUrl(href, pageUrl, origin, serviceDomain);
      if (!normalized) return;
      const title = clamp(safeText($(anchorEl).text() || $(anchorEl).attr("aria-label"), labelFromUrlPath(normalized)), 60);
      const key = `${title}::${normalized}`;
      if (seenTop.has(key)) return;
      seenTop.add(key);
      trees.push({
        id: `menu_${toSlug(`${title}_${normalized}`, "node")}`,
        title,
        url: normalized,
        children: [],
      });
    });
  });

  return trees.slice(0, 40);
}

function extractMenuStructureFromHtml(
  html: string,
  pageUrl: string,
  origin: string,
  serviceDomain: string
): MenuStructureResult {
  const sectionDefs: Array<{ sectionType: MenuStructureSection["sectionType"]; title: string; selectors: string }> = [
    {
      sectionType: "top_nav",
      title: "Top Navigation",
      selectors: "header nav, nav[role='navigation'], .gnb, [class*='gnb']",
    },
    {
      sectionType: "hamburger_menu",
      title: "Hamburger Menu",
      selectors:
        ".bm-menu-wrap[aria-hidden='false'], .bm-item-list, .hamburger-menu-wrapper, [class*='hamburger-menu'], [class*='drawer'] nav",
    },
    {
      sectionType: "search_menu",
      title: "Search Menu",
      selectors: "[class*='search'] nav, [id*='search'] nav, [class*='search'] ul, [class*='search'] [role='menu']",
    },
    {
      sectionType: "menu_other",
      title: "Other Menus",
      selectors: "nav, header [class*='menu'], header [id*='menu']",
    },
  ];

  const sections: MenuStructureSection[] = [];
  const dedupe = new Set<string>();

  sectionDefs.forEach((sectionDef) => {
    const trees = extractMenuTreesBySelectors(html, pageUrl, origin, serviceDomain, sectionDef.selectors);
    const uniqueTrees = trees.filter((node) => {
      const key = `${node.title}::${node.url || ""}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });
    if (uniqueTrees.length === 0) return;
    sections.push({
      sectionType: sectionDef.sectionType,
      title: sectionDef.title,
      trees: uniqueTrees,
    });
  });

  const mergedTrees = sections.flatMap((section) => section.trees);
  return { sections, trees: mergedTrees.slice(0, 120) };
}

function mergeMenuNodeArrays(base: MenuStructureNode[], incoming: MenuStructureNode[]) {
  const keyOf = (node: MenuStructureNode) =>
    `${normalizeForKey(node.title || "")}::${normalizeForKey(node.url || "")}`;
  const merged = new Map<string, MenuStructureNode>();

  const addNode = (node: MenuStructureNode) => {
    const key = keyOf(node);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...node,
        children: mergeMenuNodeArrays([], node.children || []),
      });
      return;
    }
    existing.children = mergeMenuNodeArrays(existing.children || [], node.children || []);
    if (!existing.url && node.url) existing.url = node.url;
    if (!existing.title && node.title) existing.title = node.title;
  };

  base.forEach(addNode);
  incoming.forEach(addNode);
  return Array.from(merged.values());
}

function mergeMenuStructureResults(results: MenuStructureResult[]): MenuStructureResult {
  const sectionMap = new Map<MenuStructureSection["sectionType"], MenuStructureSection>();
  results.forEach((result) => {
    (result.sections || []).forEach((section) => {
      const prev = sectionMap.get(section.sectionType);
      if (!prev) {
        sectionMap.set(section.sectionType, {
          ...section,
          trees: mergeMenuNodeArrays([], section.trees || []),
        });
      } else {
        prev.trees = mergeMenuNodeArrays(prev.trees || [], section.trees || []);
      }
    });
  });
  const sections = Array.from(sectionMap.values());
  return {
    sections,
    trees: mergeMenuNodeArrays([], sections.flatMap((section) => section.trees || [])).slice(0, 160),
  };
}

function nestMenuTreesByUrlPrefix(nodes: MenuStructureNode[]): MenuStructureNode[] {
  const cloneNodes = (items: MenuStructureNode[]): MenuStructureNode[] =>
    items.map((node) => ({
      ...node,
      children: cloneNodes(node.children || []),
    }));

  const getPath = (url: string | null) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/\/+$/, "") || "/";
    } catch {
      return null;
    }
  };

  const getDepth = (path: string | null) => {
    if (!path) return 0;
    if (path === "/") return 0;
    return path.split("/").filter(Boolean).length;
  };

  const dedupeChildren = (children: MenuStructureNode[]) => {
    const seen = new Set<string>();
    return children.filter((child) => {
      const key = `${normalizeForKey(child.title || "")}::${normalizeForKey(child.url || "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const work = cloneNodes(nodes);
  const absorbed = new Set<number>();

  for (let i = 0; i < work.length; i += 1) {
    const childNode = work[i];
    if (!childNode.url) continue;
    const childPath = getPath(childNode.url);
    const childDepth = getDepth(childPath);
    if (!childPath || childPath === "/" || childDepth <= 1) continue;

    let parentIndex = -1;
    let parentDepth = -1;
    for (let j = 0; j < work.length; j += 1) {
      if (i === j) continue;
      const parentNode = work[j];
      if (!parentNode.url) continue;
      const parentPath = getPath(parentNode.url);
      if (!parentPath || parentPath === "/") continue;
      if (!childPath.startsWith(`${parentPath}/`)) continue;

      const depth = getDepth(parentPath);
      if (depth > parentDepth) {
        parentDepth = depth;
        parentIndex = j;
      }
    }

    if (parentIndex < 0) continue;
    const parentNode = work[parentIndex];
    parentNode.children = dedupeChildren([...(parentNode.children || []), childNode]);
    absorbed.add(i);
  }

  return work
    .filter((_, idx) => !absorbed.has(idx))
    .map((node) => ({
      ...node,
      children: dedupeChildren(nestMenuTreesByUrlPrefix(node.children || [])),
    }));
}

function applyMenuHierarchy(result: MenuStructureResult): MenuStructureResult {
  const rebalanceTopLevel = (trees: MenuStructureNode[]): MenuStructureNode[] => {
    const getPath = (url: string | null) => {
      if (!url) return null;
      try {
        return new URL(url).pathname.replace(/\/+$/, "") || "/";
      } catch {
        return null;
      }
    };
    const toLabel = (segment: string) => {
      const plain = decodeURIComponent(segment || "").replace(/[-_]+/g, " ").trim();
      if (!plain) return "menu";
      return plain.charAt(0).toUpperCase() + plain.slice(1);
    };
    const normalizeNode = (node: MenuStructureNode) => ({
      ...node,
      children: [...(node.children || [])],
    });
    const dedupeByKey = (nodes: MenuStructureNode[]) => {
      const seen = new Set<string>();
      return nodes.filter((node) => {
        const key = `${normalizeForKey(node.title || "")}::${normalizeForKey(node.url || "")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const out = trees.map(normalizeNode);
    const parentByPath = new Map<string, MenuStructureNode>();
    out.forEach((node) => {
      const path = getPath(node.url);
      if (!path) return;
      parentByPath.set(path, node);
    });

    const absorbed = new Set<number>();
    const syntheticByFirstSeg = new Map<string, MenuStructureNode>();

    out.forEach((node, index) => {
      const path = getPath(node.url);
      if (!path || path === "/") return;
      const segments = path.split("/").filter(Boolean);
      if (segments.length <= 1) return;

      const firstSeg = segments[0];
      const firstPath = `/${firstSeg}`;
      const explicitParent = parentByPath.get(firstPath);
      if (explicitParent && explicitParent.id !== node.id) {
        explicitParent.children = dedupeByKey([...(explicitParent.children || []), node]);
        absorbed.add(index);
        return;
      }

      let synthetic = syntheticByFirstSeg.get(firstSeg);
      if (!synthetic) {
        synthetic = {
          id: `menu_group_${toSlug(firstSeg, "group")}`,
          title: toLabel(firstSeg),
          url: firstPath,
          children: [],
        };
        syntheticByFirstSeg.set(firstSeg, synthetic);
      }
      synthetic.children = dedupeByKey([...(synthetic.children || []), node]);
      absorbed.add(index);
    });

    const kept = out.filter((_, index) => !absorbed.has(index));
    const merged = [...kept, ...Array.from(syntheticByFirstSeg.values())];
    return dedupeByKey(merged);
  };

  const sections = (result.sections || []).map((section) => ({
    ...section,
    trees: rebalanceTopLevel(nestMenuTreesByUrlPrefix(section.trees || [])),
  }));
  const mergedSectionTrees = sections.flatMap((section) => section.trees || []);
  return {
    sections,
    trees: rebalanceTopLevel(nestMenuTreesByUrlPrefix(mergeMenuNodeArrays([], mergedSectionTrees))),
  };
}

async function probeMenuAndCaptureHtml(page: Page): Promise<string | null> {
  const openerSelectors = [
    ".bm-burger-button button",
    "button[aria-label*='menu' i]",
    "button[aria-label*='메뉴']",
    "button[class*='hamburger']",
    "[class*='hamburger-menu'] button",
    "button[id*='menu']",
    "[data-testid*='menu']",
    "[class*='menu-button']",
    "button[aria-haspopup='menu']",
    "button[aria-expanded='false']",
  ];

  for (const selector of openerSelectors) {
    const exists = await page.$(selector).catch(() => null);
    if (!exists) continue;
    await page.click(selector).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const html = await page.content().catch(() => null);
    if (html) {
      // Best effort close to restore page state for remaining steps.
      const closeBtn = await page.$("button#react-burger-cross-btn, .bm-cross-button button, .bm-cross-button").catch(() => null);
      if (closeBtn) {
        await closeBtn.click().catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return html;
    }
  }
  return null;
}

async function probeTopNavSubmenusAndCaptureHtml(page: Page): Promise<string[]> {
  try {
    const selectors = await page.evaluate(() => {
      const isVisible = (el: Element) => {
        const rect = (el as HTMLElement).getBoundingClientRect?.();
        if (!rect) return false;
        if (rect.width < 8 || rect.height < 8) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const candidates = Array.from(
        document.querySelectorAll(
          "header nav li, header nav a, header nav button, nav [role='menuitem'], .gnb li, .gnb a, .gnb button"
        )
      )
        .filter(isVisible)
        .filter((el) => {
          const text = `${(el.textContent || "").trim()} ${(el.getAttribute("aria-label") || "")}`.toLowerCase();
          const cls = (el.getAttribute("class") || "").toLowerCase();
          const hasPopup = (el.getAttribute("aria-haspopup") || "").toLowerCase() === "true";
          const hasSubHint = /submenu|sub-menu|dropdown|mega|gnb|menu/.test(cls);
          const hasSubmenuChild = Boolean(
            el.querySelector?.(":scope > ul, :scope > [role='menu'], :scope > [class*='sub'], :scope > [class*='dropdown']")
          );
          const likelyMenu = text.length > 0 && !/login|signin|sign in|회원가입|로그인/.test(text);
          const hasSiblingPanel = Boolean(
            el.parentElement?.querySelector(":scope > ul, :scope > [role='menu'], :scope > [class*='sub'], :scope > [class*='dropdown']")
          );
          return hasPopup || hasSubHint || hasSubmenuChild || hasSiblingPanel || likelyMenu;
        })
        .slice(0, 16);

      return candidates.map((el, idx) => {
        (el as HTMLElement).setAttribute("data-nav-probe", String(idx));
        return `[data-nav-probe="${idx}"]`;
      });
    });

    const htmls: string[] = [];
    for (const selector of selectors) {
      await page.hover(selector).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const hoverHtml = await page.content().catch(() => null);
      if (hoverHtml) htmls.push(hoverHtml);

      await page.click(selector).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 450));
      const clickHtml = await page.content().catch(() => null);
      if (clickHtml) htmls.push(clickHtml);
    }
    return htmls.slice(0, 30);
  } catch {
    return [];
  }
}

function annotateMenuNodesWithPageType(
  nodes: MenuStructureNode[],
  classifyByUrl: (url: string) => string
): MenuStructureNode[] {
  return nodes.map((node) => ({
    ...node,
    pageType: node.url ? classifyByUrl(node.url) : "group",
    children: annotateMenuNodesWithPageType(node.children || [], classifyByUrl),
  }));
}

function inferIntentFromInteraction(actionType: string, label: string, destination?: string | null) {
  const text = `${label || ""} ${destination || ""}`.toLowerCase();
  if (actionType === "form_submit" || actionType === "download") return "convert";
  if (INTENT_KEYWORD_REGEX.convert.test(text)) return "convert";
  if (actionType === "open_modal" || actionType === "open_dropdown" || actionType === "open_popup") return "evaluate";
  if (INTENT_KEYWORD_REGEX.evaluate.test(text)) return "evaluate";
  if (actionType === "navigate" || INTENT_KEYWORD_REGEX.discover.test(text)) return "discover";
  return "discover";
}

function scoreCandidateUrl(rawUrl: string, rootOrigin: string, serviceDomain: string) {
  const normalized = toSameOriginUrl(rawUrl, rootOrigin, rootOrigin, serviceDomain);
  if (!normalized) return -999;
  let score = 0;
  const lower = normalized.toLowerCase();
  const isAuth = /(signup|sign-up|sign_up|join|register|login|sign-?in)/.test(lower);
  const isProductFlow = /(product|goods|item|pdp|article|detail|view|read|content|series|seminar|review|blog|service|feature|list|category|contents|insight|case)/.test(lower);
  const isCheckoutFlow =
    /(checkout|purchase|cart|payment|order|contact|lead|trial|donat|donation|sponsor|fund|후원|기부|문의|상담|결제|구매|체험)/.test(
      lower
    );

  if (isCheckoutFlow) {
    score += 26;
  }
  if (isProductFlow) {
    score += 20;
  }
  if (isAuth) {
    // Keep one auth page but avoid auth pages dominating crawl budget.
    score += 6;
  }
  if (/(terms|privacy|policy|facebook|instagram|youtube|linkedin|twitter|x.com)/.test(lower)) {
    score -= 10;
  }
  if (/\?.*(page|sort|ref|utm_|fbclid|gclid)=/i.test(lower)) {
    score -= 4;
  }

  try {
    const parsed = new URL(normalized);
    const depth = parsed.pathname.split("/").filter(Boolean).length;
    score += Math.max(0, 6 - depth);
    if (isAuth && parsed.search) score -= 8;
  } catch {
    // noop
  }

  return score;
}

function prioritizeDiscoveredLinks(links: string[], rootOrigin: string, serviceDomain: string) {
  return [...links]
    .map((link, index) => ({
      link,
      score: scoreCandidateUrl(link, rootOrigin, serviceDomain),
      index,
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.link);
}

function shouldForceQueue(url: string) {
  return /(checkout|purchase|cart|payment|contact|inquiry|consult|pricing|plan|membership|seminar|series|content|review|product|article|detail|donat|donation|sponsor|fund|후원|기부|문의|상담|요금|플랜|결제|구독|세미나|시리즈|콘텐츠|상세|장바구니|주문)/i.test(
    url
  );
}

function isAuthLikeUrl(url: string) {
  return /(^|\/)(login|signin|sign-in|sign_up|sign-up|signup|register|join)(\/|$|\?)/i.test(url);
}

function getDropReasonOnDequeue(url: string): CrawlDropReason | null {
  const lower = (url || "").toLowerCase();
  if (/\.(css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|zip|rar|7z)$/i.test(lower)) {
    return "asset_url";
  }
  if (/(facebook|instagram|youtube|linkedin|twitter|x\.com|t\.co|kakao\.com|line\.me)/i.test(lower)) {
    return "social_external_like";
  }
  if (/(\/terms|\/privacy|\/policy)/i.test(lower)) {
    return "policy_page";
  }
  return null;
}

function isViewStateInteraction(actionType: string, label: string, className?: string | null) {
  if (["open_modal", "open_dropdown", "open_popup", "open_tab"].includes(actionType)) return true;
  const text = `${label || ""} ${className || ""}`.toLowerCase();
  return /(modal|popup|drawer|accordion|tab|menu|filter|모달|팝업|드로어|아코디언|탭|메뉴|필터)/i.test(text);
}

function isConversionPoint(actionType: string, label: string, destination?: string | null) {
  if (actionType === "form_submit" || actionType === "download") return true;
  const text = `${label || ""} ${destination || ""}`;
  return INTENT_KEYWORD_REGEX.convert.test(text);
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

function normalizeForKey(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9가-힣 _-]/g, "")
    .trim()
    .slice(0, 40);
}

function getNodeDepth(el: DomHandlerElement | null | undefined) {
  let depth = 0;
  let current: DomHandlerElement | DomHandlerParentNode | null | undefined = el;
  while (current?.parent) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function isAncestorNode(ancestor: DomHandlerElement, node: DomHandlerElement) {
  let current: DomHandlerElement | DomHandlerParentNode | null | undefined =
    node.parent as DomHandlerElement | DomHandlerParentNode | null | undefined;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isIndependentChildBlock(
  $: cheerio.CheerioAPI,
  el: DomHandlerElement,
  tagName: string,
  linkCount: number,
  buttonCount: number,
  heading: string
) {
  if ($(el).find("form").length > 0) return true;
  if (buttonCount >= 2 && /(cta|start|sign|join|contact|문의|신청|가입|구독|결제)/i.test(`${heading} ${$(el).attr("class") || ""}`)) {
    return true;
  }
  if ($(el).find("[role='tab'], [role='tablist'], [aria-haspopup='true']").length > 0) return true;
  if (linkCount >= 6 && $(el).children("article, li, .card, [class*='card']").length >= 3) return true;
  if (tagName === "form") return true;
  return false;
}

function isDivFallbackCandidate($: cheerio.CheerioAPI, el: DomHandlerElement) {
  const $el = $(el);
  if ($el.parents("header, nav, main, section, article, footer").length > 0) return false;
  const heading = safeText($el.find("h1, h2, h3").first().text(), "");
  const linkCount = $el.find("a").length;
  const buttonCount = $el.find("button, [role='button'], input[type='submit'], input[type='button']").length;
  const childCount = $el.children().length;
  const textLen = safeText($el.text(), "").length;
  return childCount >= 6 || heading.length > 0 || buttonCount >= 2 || linkCount >= 4 || textLen >= 220;
}

function isPromotedInteraction(actionType: string, label: string, destination: string | null) {
  if (["form_submit", "download", "open_modal", "open_dropdown", "open_popup", "open_tab"].includes(actionType))
    return true;
  const text = `${label || ""} ${destination || ""}`.toLowerCase();
  if (/(login|sign.?up|register|join|checkout|purchase|lead|contact|문의|신청|가입|결제|구매|상담)/i.test(text)) {
    return true;
  }
  if (destination && /^https?:\/\//i.test(destination)) return true;
  return false;
}

function classifyPageType(url: string, title: string, sectionLabels: string[]) {
  const lower = `${url} ${title}`.toLowerCase();
  const sectionText = sectionLabels.join(" ").toLowerCase();
  const merged = `${lower} ${sectionText}`;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (/(checkout|payment|결제|주문|donat|donation|sponsor|fund|후원|기부)/.test(merged)) return "checkout" as const;
  if (/(purchase|order-complete|thank.?you|구매완료|주문완료|후원완료|기부완료)/.test(merged)) return "purchase" as const;
  if (/(cart|bag|basket|장바구니)/.test(merged)) return "cart" as const;
  if (/(sign.?up|register|join|회원가입|가입하기)/.test(merged)) return "sign_up" as const;
  if (/(login|sign.?in|로그인)/.test(merged)) return "login" as const;
  if (/(product|goods|item|pdp|article\/|seminar\/|video\/|상세)/.test(merged)) return "pdp" as const;
  if (/(category|collection|products|shop|plp|목록|카테고리|시리즈|contents)/.test(merged)) return "plp" as const;
  if (/(mypage|account|profile|dashboard|마이|내 정보)/.test(lower)) return "mypage" as const;
  if (/(complete|success|done|thank|완료|성공)/.test(lower)) return "complete" as const;
  if (/(search|검색)/.test(lower)) return "search" as const;
  if (/(form|apply|signup|register|inquiry|문의|신청|가입)/.test(lower)) return "form" as const;
  if (/(article\/|detail|view|read|seminar\/|video\/|상세)/.test(lower)) return "detail" as const;
  if (/(list|category|series|contents|review|seminar|목록|카테고리|시리즈|콘텐츠)/.test(lower)) return "list" as const;
  if (path === "/" || /(home|landing|main|소개)/.test(lower)) return "main" as const;
  if (/(contact|inquiry|consult|문의|상담|신청)/.test(merged)) return "form" as const;
  return "other" as const;
}

function inferPageGoal(pageType: PageClassification["pageType"], sectionLabels: string[]) {
  if (pageType === "main") return "첫 진입 사용자에게 핵심 가치 전달 및 주요 흐름 분기";
  if (pageType === "plp") return "목록 탐색을 통해 상세 페이지 진입 유도";
  if (pageType === "pdp") return "상세 정보 확인 후 전환 행동 유도";
  if (pageType === "cart") return "선택 항목 확인 및 결제 단계 진입";
  if (pageType === "checkout") return "결제/주문 정보 입력 및 완료 유도";
  if (pageType === "purchase") return "구매 완료 확인 및 후속 행동 안내";
  if (pageType === "login") return "인증 완료 후 서비스 재진입";
  if (pageType === "sign_up") return "회원가입 완료 및 로그인 연결";
  if (pageType === "list") return "콘텐츠/상품 탐색과 상세 진입 유도";
  if (pageType === "detail") return "상세 정보 이해와 전환 CTA 유도";
  if (pageType === "search") return "의도 기반 탐색 완료";
  if (pageType === "form") return "리드/가입/신청 제출 완료";
  if (pageType === "complete") return "전환 완료 확인";
  if (pageType === "mypage") return "사용자 계정 관리/재방문 행동";
  const hasCta = sectionLabels.some((label) =>
    /(가입|문의|신청|결제|구매|login|signup|contact|checkout|trial|cta)/i.test(label)
  );
  return hasCta ? "핵심 CTA 유도" : "정보 전달";
}

function inferSectionGoal(sectionType: string) {
  if (sectionType === "hero_banner") return "가치 제안과 주요 CTA 노출";
  if (sectionType === "navigation") return "탐색 허브 제공";
  if (sectionType === "cta_section") return "전환 행동 유도";
  if (sectionType === "feature_section") return "핵심 콘텐츠/가치 근거 제시";
  if (sectionType === "footer") return "보조 정보/정책 링크 제공";
  return "정보 전달";
}

function inferPageTypeFromUrl(url: string, title = "") {
  const lower = `${url} ${title}`.toLowerCase();
  if (/(checkout|payment|결제|주문|donat|donation|sponsor|fund|후원|기부)/.test(lower)) return "checkout";
  if (/(purchase|order-complete|thank.?you|구매완료|주문완료|후원완료|기부완료)/.test(lower)) return "purchase";
  if (/(cart|bag|basket|장바구니)/.test(lower)) return "cart";
  if (/(sign.?up|register|join|회원가입|가입하기)/.test(lower)) return "sign_up";
  if (/(login|sign.?in|로그인)/.test(lower)) return "login";
  if (/(product|goods|item|pdp)/.test(lower)) return "pdp";
  if (/(category|collection|products|shop|plp)/.test(lower)) return "plp";
  if (/(mypage|account|profile|dashboard|마이)/.test(lower)) return "mypage";
  if (/(complete|success|done|thank|완료|성공)/.test(lower)) return "complete";
  if (/(search|검색)/.test(lower)) return "search";
  if (/(apply|signup|register|inquiry|문의|신청|가입)/.test(lower)) return "form";
  if (/(article\/|detail|view|seminar\/|video\/|상세)/.test(lower)) return "detail";
  if (/(list|category|series|contents|review|seminar|목록|카테고리|시리즈|콘텐츠)/.test(lower)) return "list";
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "main";
  } catch {}
  return "other";
}

function getPrimaryCtasFromSections(sectionLabels: string[]) {
  const ctas = sectionLabels
    .filter(
      (label) =>
        /(cta|start|trial|signup|sign.?up|join|contact|inquiry|checkout|buy|purchase|donat|donation|sponsor|fund|가입|문의|신청|결제|구매|후원|기부|체험|도입|상담)/i.test(
          label
        )
    )
    .slice(0, 4);
  const uniq = Array.from(new Set(ctas));
  return { primary: uniq[0] || null, secondary: uniq[1] || null };
}

function findShortestPath(
  startId: string,
  adjacency: Map<string, string[]>,
  isTarget: (pageId: string) => boolean
) {
  if (!startId) return [] as string[];
  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const prev = new Map<string, string | null>([[startId, null]]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur !== startId && isTarget(cur)) {
      const path: string[] = [];
      let node: string | null = cur;
      while (node) {
        path.push(node);
        node = prev.get(node) || null;
      }
      return path.reverse();
    }
    (adjacency.get(cur) || []).forEach((next) => {
      if (visited.has(next)) return;
      visited.add(next);
      prev.set(next, cur);
      queue.push(next);
    });
  }
  return [] as string[];
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
  const role = ($el.attr("role") || "").toLowerCase();
  const ariaControls = ($el.attr("aria-controls") || "").toLowerCase();
  const ariaSelected = ($el.attr("aria-selected") || "").toLowerCase();
  const ariaHaspopup = ($el.attr("aria-haspopup") || "").toLowerCase();
  const dataToggle = ($el.attr("data-toggle") || $el.attr("data-bs-toggle") || "").toLowerCase();
  const dataTab = ($el.attr("data-tab") || $el.attr("data-tabs") || "").toLowerCase();
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

  if (
    role === "tab" ||
    ariaSelected === "true" ||
    ariaControls.includes("tab") ||
    dataTab.length > 0 ||
    /\btab\b/.test(className)
  ) {
    return {
      actionType: "open_tab",
      destination: ariaControls || null,
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
  const job = await prisma.analyzeJob.update({
    where: { id: jobId },
    data,
    include: { project: true },
  });

  if (data.status === "completed" && job.initiatedByUserId) {
    await logActivity({
      name: "analysis_completed",
      userId: job.initiatedByUserId,
      workspaceId: job.project.workspaceId,
      projectId: job.projectId,
    });
  }
}

async function fetchFallbackHtml(targetUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    });
    const text = await res.text();
    if (text && text.trim().length > 0) return text;
  } catch {
    // fallback below
  } finally {
    clearTimeout(timer);
  }
  return `<html><head><title>${targetUrl}</title></head><body><main><h1>${targetUrl}</h1></main></body></html>`;
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

      const getText = (el: Element) =>
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

async function waitForDomReadySignals(page: Page) {
  const maxAttempts = 10;
  let stableRounds = 0;
  let prev: { anchorCount: number; bodyTextLen: number; rootChildren: number } | null = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    const current = await page
      .evaluate(() => {
        const root =
          document.querySelector("#root") ||
          document.querySelector("#__next") ||
          document.querySelector("main") ||
          document.body;
        return {
          anchorCount: document.querySelectorAll("a[href]").length,
          bodyTextLen: (document.body?.innerText || "").trim().length,
          rootChildren: root?.children?.length || 0,
        };
      })
      .catch(() => ({ anchorCount: 0, bodyTextLen: 0, rootChildren: 0 }));

    if (
      prev &&
      Math.abs(current.anchorCount - prev.anchorCount) <= 1 &&
      Math.abs(current.bodyTextLen - prev.bodyTextLen) <= 80 &&
      Math.abs(current.rootChildren - prev.rootChildren) <= 1
    ) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    prev = current;
    if (stableRounds >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return prev || { anchorCount: 0, bodyTextLen: 0, rootChildren: 0 };
}

async function runAnalyzePipeline(
  projectId: string,
  targetUrl: string,
  jobId: string
) {
  await updateJob(jobId, {
    status: "running",
    startedAt: new Date(),
    progress: 10,
    errorMessage: null,
  });

  if (!projectId || typeof projectId !== "string") {
    throw new Error("Invalid project id");
  }

  const normalizedTargetUrl = normalizeUrlForCrawl(targetUrl);
  let origin = "";
  let serviceDomain = "";
  try {
    const parsed = new URL(normalizedTargetUrl);
    origin = parsed.origin;
    serviceDomain = getServiceDomain(parsed.hostname);
  } catch {
    throw new Error(`Invalid target URL for analyze: ${normalizedTargetUrl}`);
  }

  let projectForSeeds: { sitemapOverrideJson: string | null; pages: { url: string }[] } | null = null;
  try {
    projectForSeeds = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        sitemapOverrideJson: true,
        pages: { select: { url: true } },
      },
    });
  } catch (error) {
    console.error("Analyze seed query failed; continue without seed pages", {
      projectId,
      normalizedTargetUrl,
      origin,
      serviceDomain,
      error,
    });
    projectForSeeds = null;
  }
  const override = parseJson<SitemapOverridePayload | null>(projectForSeeds?.sitemapOverrideJson, null);
  const seedCandidates = [
    ...(override?.nodes?.map((node) => node.url) || []),
    ...((projectForSeeds?.pages || []).map((page) => page.url) || []),
  ];
  const normalizedSeeds = Array.from(
    new Set(
      seedCandidates
        .map((seed) => toSameOriginUrl(seed, normalizedTargetUrl, origin, serviceDomain))
        .filter((seed): seed is string => Boolean(seed))
    )
  );

  const maxAnalyzePages = MAX_ANALYZE_PAGES;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const MAX_QUEUE_SIZE = maxAnalyzePages * 10;
  const priorityQueue: QueueCandidate[] = [{ url: normalizedTargetUrl, score: 999, sourceUrl: normalizedTargetUrl }];
  const explorationQueue: QueueCandidate[] = [];
  normalizedSeeds
    .filter((seed) => seed !== normalizedTargetUrl)
    .forEach((seed) => {
      if (isAuthLikeUrl(seed) && (priorityQueue.some((q) => isAuthLikeUrl(q.url)) || explorationQueue.some((q) => isAuthLikeUrl(q.url)))) {
        return;
      }
      const score = scoreCandidateUrl(seed, origin, serviceDomain);
      if (shouldForceQueue(seed) || score >= 10) {
        priorityQueue.push({ url: seed, score, sourceUrl: normalizedTargetUrl });
      } else {
        explorationQueue.push({ url: seed, score, sourceUrl: normalizedTargetUrl });
      }
    });

  const queued = new Set<string>([
    ...priorityQueue.map((item) => item.url),
    ...explorationQueue.map((item) => item.url),
  ]);
  const visited = new Set<string>();
  const crawledPages: CrawledPage[] = [];
  const rootMenuProbeHtmls: string[] = [];
  let rootMenuProbeHtml: string | null = null;
  const crawlDiagnostics = {
    queuedPriority: priorityQueue.length,
    queuedExploration: explorationQueue.length,
    droppedByReason: {
      duplicate: 0,
      queue_full: 0,
      low_score: 0,
      asset_url: 0,
      social_external_like: 0,
      policy_page: 0,
    },
  };

  try {
    let turn = 0;
    while ((priorityQueue.length > 0 || explorationQueue.length > 0) && crawledPages.length < maxAnalyzePages) {
      const pickPriority = turn % 10 < 7;
      turn += 1;
      const nextCandidate =
        (pickPriority ? priorityQueue.shift() : explorationQueue.shift()) ||
        priorityQueue.shift() ||
        explorationQueue.shift();
      const nextUrl = nextCandidate?.url;
      if (!nextUrl || visited.has(nextUrl)) continue;
      const dropReason = getDropReasonOnDequeue(nextUrl);
      if (dropReason) {
        crawlDiagnostics.droppedByReason[dropReason] += 1;
        continue;
      }
      visited.add(nextUrl);

      let page: Page | null = null;
      try {
        page = await browser!.newPage();
        const networkDiag = {
          failedRequests: 0,
          failedSamples: [] as Array<{ url: string; errorText: string }>,
          http4xx5xx: 0,
          httpSamples: [] as Array<{ url: string; status: number }>,
        };
        page.on("requestfailed", (req) => {
          networkDiag.failedRequests += 1;
          if (networkDiag.failedSamples.length < 10) {
            networkDiag.failedSamples.push({
              url: req.url(),
              errorText: req.failure()?.errorText || "unknown",
            });
          }
        });
        page.on("response", (res) => {
          const status = res.status();
          if (status >= 400) {
            networkDiag.http4xx5xx += 1;
            if (networkDiag.httpSamples.length < 10) {
              networkDiag.httpSamples.push({ url: res.url(), status });
            }
          }
        });
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

        await page.waitForFunction(() => document.readyState === "complete", { timeout: 6000 }).catch(() => null);
        await page
          .waitForFunction(
            () => {
              const root =
                document.querySelector("#root") ||
                document.querySelector("#__next") ||
                document.querySelector("main") ||
                document.body;
              const anchors = document.querySelectorAll("a[href]").length;
              const textLen = (document.body?.innerText || "").trim().length;
              const rootChildren = root?.children?.length || 0;
              return anchors > 0 || textLen > 400 || rootChildren > 4;
            },
            { timeout: 6000 }
          )
          .catch(() => null);
        await page.waitForNetworkIdle({ idleTime: 700, timeout: 5000 }).catch(() => null);
        debugLog("[crawl:network]", {
          pageUrl: nextUrl,
          failedRequests: networkDiag.failedRequests,
          failedSamples: networkDiag.failedSamples,
          http4xx5xx: networkDiag.http4xx5xx,
          httpSamples: networkDiag.httpSamples,
        });

        const domStateBeforeNeutralize = await waitForDomReadySignals(page);
        debugLog("[crawl:dom-state]", {
          pageUrl: nextUrl,
          stage: "before-neutralize",
          ...domStateBeforeNeutralize,
        });

        await neutralizeBlockingPopups(page);

        if (!rootMenuProbeHtml && nextUrl === normalizedTargetUrl) {
          rootMenuProbeHtml = await probeMenuAndCaptureHtml(page);
          if (rootMenuProbeHtml) rootMenuProbeHtmls.push(rootMenuProbeHtml);
          const navProbeHtmls = await probeTopNavSubmenusAndCaptureHtml(page);
          navProbeHtmls.forEach((html) => rootMenuProbeHtmls.push(html));
        }

        const domStateAfterNeutralize = await waitForDomReadySignals(page);
        debugLog("[crawl:dom-state]", {
          pageUrl: nextUrl,
          stage: "after-neutralize",
          ...domStateAfterNeutralize,
        });

        await new Promise((resolve) => setTimeout(resolve, 200));
        const html = await page.content();
        const $ = cheerio.load(html);
        const title = safeText($("title").text(), nextUrl);
        const simpleAnchorHrefs = await page
          .$$eval("a[href]", (els) =>
            els
              .map((el) => (el as HTMLAnchorElement).href)
              .filter((href) => typeof href === "string" && href.length > 0)
          )
          .catch(() => [] as string[]);
        debugLog("[crawl:simple-a-hrefs]", {
          pageUrl: nextUrl,
          count: simpleAnchorHrefs.length,
          sample: simpleAnchorHrefs.slice(0, 20),
        });

        const staticLinks = extractInternalLinks($, nextUrl, origin, serviceDomain);
        const browserLinks = await extractInternalLinksFromBrowser(page, nextUrl, origin, serviceDomain);
        const allDiscoveredLinks = Array.from(new Set([...staticLinks, ...browserLinks]));
        debugLog("[crawl:raw-links]", {
          pageUrl: nextUrl,
          staticLinksCount: staticLinks.length,
          runtimeLinksCount: browserLinks.length,
          clickLinksCount: 0,
          hamburgerLinksCount: 0,
          sample: allDiscoveredLinks.slice(0, 20),
        });
        let discoveredLinks = allDiscoveredLinks.slice(0, MAX_DISCOVER_LINKS_PER_PAGE);

        const beforeFilterLinks = [...discoveredLinks];
        discoveredLinks = prioritizeDiscoveredLinks(discoveredLinks, origin, serviceDomain).slice(
          0,
          MAX_DISCOVER_LINKS_PER_PAGE
        );
        debugLog("[crawl:filtered-links]", {
          pageUrl: nextUrl,
          before: beforeFilterLinks.length,
          after: discoveredLinks.length,
          sampleBefore: beforeFilterLinks.slice(0, 20),
          sampleAfter: discoveredLinks.slice(0, 20),
        });

        const queuedLinksForThisPage: string[] = [];
        discoveredLinks.forEach((link) => {
          if (visited.has(link) || queued.has(link)) {
            crawlDiagnostics.droppedByReason.duplicate += 1;
            return;
          }
          if (
            isAuthLikeUrl(link) &&
            (Array.from(visited).some((url) => isAuthLikeUrl(url)) ||
              priorityQueue.some((q) => isAuthLikeUrl(q.url)) ||
              explorationQueue.some((q) => isAuthLikeUrl(q.url)))
          ) {
            crawlDiagnostics.droppedByReason.low_score += 1;
            return;
          }
          const score = scoreCandidateUrl(link, origin, serviceDomain);
          const force = shouldForceQueue(link);
          const candidate: QueueCandidate = { url: link, score, sourceUrl: nextUrl };
          const queueSize = priorityQueue.length + explorationQueue.length;
          if (queueSize >= MAX_QUEUE_SIZE) {
            crawlDiagnostics.droppedByReason.queue_full += 1;
            return;
          }
          if (!force && score < 2) {
            crawlDiagnostics.droppedByReason.low_score += 1;
            return;
          }
          if (force || score >= 10) {
            priorityQueue.push(candidate);
            priorityQueue.sort((a, b) => b.score - a.score);
            crawlDiagnostics.queuedPriority += 1;
          } else {
            explorationQueue.push(candidate);
            crawlDiagnostics.queuedExploration += 1;
          }
          queued.add(link);
          queuedLinksForThisPage.push(link);
        });
        debugLog("[crawl:queue]", {
          pageUrl: nextUrl,
          filteredCount: discoveredLinks.length,
          queuedCount: queuedLinksForThisPage.length,
          queued: queuedLinksForThisPage.slice(0, 20),
        });

        crawledPages.push({
          url: nextUrl,
          title,
          html,
          discoveredLinks,
        });

        const progress = 10 + Math.round((crawledPages.length / maxAnalyzePages) * 35);
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
    if (browser) await browser.close();
  }

  if (crawledPages.length === 0) {
    const fallbackHtml = await fetchFallbackHtml(normalizedTargetUrl);
    const $fallback = cheerio.load(fallbackHtml);
    crawledPages.push({
      url: normalizedTargetUrl,
      title: safeText($fallback("title").text(), normalizedTargetUrl),
      html: fallbackHtml,
      discoveredLinks: [],
    });
    await updateJob(jobId, { progress: 46 });
  }

  const rootCrawledPage =
    crawledPages.find((page) => page.url === normalizedTargetUrl) || crawledPages[0] || null;
  const menuSnapshots = rootCrawledPage
    ? [rootCrawledPage.html, ...rootMenuProbeHtmls].filter(
        (snapshot, index, arr): snapshot is string => Boolean(snapshot) && arr.indexOf(snapshot) === index
      )
    : [];
  const extractedMenu = rootCrawledPage
    ? applyMenuHierarchy(
        mergeMenuStructureResults(
          menuSnapshots.map((snapshotHtml) =>
            extractMenuStructureFromHtml(snapshotHtml, rootCrawledPage.url, origin, serviceDomain)
          )
        )
      )
    : { sections: [] as MenuStructureSection[], trees: [] as MenuStructureNode[] };
  const extractedMenuTrees = extractedMenu.trees;

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

    const pageDraftStartIndex = drafts.length;
    const selectedBlocks: Array<{
      element: DomHandlerElement;
      blockId: string;
      blockLabel: string;
      blockKind: string;
      draftRef: ComponentDraft;
    }> = [];
    const blockInteractionSummary = new Map<
      string,
      { total: number; promoted: number; actions: Record<string, number> }
    >();

    const semanticCandidates = $("header, nav, main, section, article, footer").toArray();
    const divFallbackCandidates = $("div")
      .toArray()
      .filter((el) => isDivFallbackCandidate($, el))
      .slice(0, 40);
    const blockCandidates = [...semanticCandidates, ...divFallbackCandidates]
      .sort((a, b) => getNodeDepth(a) - getNodeDepth(b))
      .slice(0, 120);

    blockCandidates.forEach((el, index) => {
      const tagName = el.tagName.toLowerCase();
      const className = $(el).attr("class") || "";
      const idValue = $(el).attr("id") || "";
      const heading = safeText($(el).find("h1, h2, h3").first().text(), "");
      const linkCount = $(el).find("a").length;
      const buttonCount = $(el).find("button, [role='button'], input[type='submit'], input[type='button']").length;
      const subsectionCount = $(el).children("section, article, div").length;
      const meaningfulToken = extractMeaningfulToken(className, idValue);

      if (!shouldKeepInfoBlock(tagName, linkCount, buttonCount, subsectionCount, heading)) return;

      const hasAcceptedAncestor = selectedBlocks.some((block) => isAncestorNode(block.element, el));
      if (hasAcceptedAncestor && !isIndependentChildBlock($, el, tagName, linkCount, buttonCount, heading)) {
        return;
      }

      const blockKind = classifyInfoBlock(tagName, className, idValue, heading, linkCount, buttonCount);
      const semanticTitle = heading || meaningfulToken || `${blockKind}_${index + 1}`;
      const blockLabel = `${index + 1}. ${blockKind}: ${semanticTitle}`;
      const blockId = `blk_${index + 1}_${toSlug(`${blockKind}_${semanticTitle}`, "block")}`;
      const nearestSemanticAncestor = $(el)
        .parents("header, nav, main, section, article, footer")
        .first()
        .prop("tagName")
        ?.toLowerCase() || null;

      const blockDraft: ComponentDraft = {
        pageId,
        componentType: "info_block",
        label: clamp(blockLabel),
        selector: tagName,
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          blockId,
          blockKind,
          order: index + 1,
          heading: heading || null,
          semanticTitle,
          meaningfulToken: meaningfulToken || null,
          nearestSemanticAncestor,
          linkCount,
          buttonCount,
          subsectionCount,
        }),
      };
      drafts.push(blockDraft);
      selectedBlocks.push({
        element: el,
        blockId,
        blockLabel: blockLabel,
        blockKind,
        draftRef: blockDraft,
      });
      blockInteractionSummary.set(blockId, { total: 0, promoted: 0, actions: {} });
    });

    const findOwnerBlock = (el: DomHandlerElement) => {
      const owners = selectedBlocks.filter((block) => isAncestorNode(block.element, el));
      if (owners.length === 0) return null;
      owners.sort((a, b) => getNodeDepth(b.element) - getNodeDepth(a.element));
      return owners[0];
    };

    if (!STRUCTURE_ONLY_ANALYSIS || ENABLE_INTERACTION_IN_STRUCTURE_MODE) {
      const interactionSelector = "a, button, [role='button'], input[type='button'], input[type='submit'], form";
      $(interactionSelector).each((_, el) => {
        const action = inferInteractionAction($, el);
        const href = $(el).attr("href") || $(el).attr("action") || null;
        const resolvedDestination =
          toSameOriginUrl(action.destination, crawledPage.url, origin, serviceDomain) ||
          toSameOriginUrl(href, crawledPage.url, origin, serviceDomain);
        const label = safeText(
          $(el).text() || $(el).attr("aria-label") || $(el).attr("value"),
          el.tagName.toLowerCase() === "form" ? "form" : "interaction"
        );
        const ownerBlock = findOwnerBlock(el);
        const promoted = isPromotedInteraction(action.actionType, label, resolvedDestination || action.destination);
        if (ownerBlock) {
          const summary = blockInteractionSummary.get(ownerBlock.blockId) || { total: 0, promoted: 0, actions: {} };
          summary.total += 1;
          if (promoted) summary.promoted += 1;
          summary.actions[action.actionType] = (summary.actions[action.actionType] || 0) + 1;
          blockInteractionSummary.set(ownerBlock.blockId, summary);
        }

        if (!promoted) {
          return;
        }

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
            ownerBlockId: ownerBlock?.blockId || null,
            ownerBlockLabel: ownerBlock?.blockLabel || null,
            id: $(el).attr("id") || null,
            className: $(el).attr("class") || null,
          }),
        });

        if (isViewStateInteraction(action.actionType, label, $(el).attr("class"))) {
          const stateLabel = `${action.actionType}:${label}`;
          drafts.push({
            pageId,
            componentType: "view_state",
            label: clamp(stateLabel, 80),
            selector: el.tagName.toLowerCase(),
            metadataJson: JSON.stringify({
              stage: "step2_interaction_structure",
              stateType: action.actionType,
              relatedLabel: label,
              destination: resolvedDestination || action.destination || null,
            }),
          });
        }

        if (isConversionPoint(action.actionType, label, resolvedDestination || action.destination)) {
          drafts.push({
            pageId,
            componentType: "conversion_point",
            label: clamp(label, 80),
            selector: el.tagName.toLowerCase(),
            metadataJson: JSON.stringify({
              stage: "step3_conversion_structure",
              actionType: action.actionType,
              intent: inferIntentFromInteraction(action.actionType, label, resolvedDestination || action.destination),
              destination: resolvedDestination || action.destination || null,
              ownerBlockId: ownerBlock?.blockId || null,
            }),
          });
        }
      });
    }

    selectedBlocks.forEach((block) => {
      const summary = blockInteractionSummary.get(block.blockId);
      if (!summary) return;
      const metadata = parseJson<Record<string, unknown>>(block.draftRef.metadataJson, {});
      block.draftRef.metadataJson = JSON.stringify({
        ...metadata,
        interactionSummary: summary,
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

    const generatedForThisPage = drafts.slice(pageDraftStartIndex);
    const hasInfoBlock = generatedForThisPage.some((d) => d.componentType === "info_block");
    const hasHeading = generatedForThisPage.some((d) => d.componentType === "heading");
    const hasInteraction = generatedForThisPage.some((d) => d.componentType === "interaction");

    // Fallback: when anti-bot/dynamic rendering yields sparse DOM, keep minimal analyzable structure.
    if (!hasInfoBlock) {
      const bodyTextSample = clamp(safeText($("body").text(), ""), 48) || "page_body";
      drafts.push({
        pageId,
        componentType: "info_block",
        label: `1. content_section: ${bodyTextSample}`,
        selector: "body",
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          blockKind: "content_section",
          order: 1,
          heading: null,
          semanticTitle: bodyTextSample,
          meaningfulToken: null,
          linkCount: crawledPage.discoveredLinks.length,
          buttonCount: 0,
          subsectionCount: 0,
          fallback: true,
        }),
      });
    }

    if (!hasHeading) {
      drafts.push({
        pageId,
        componentType: "heading",
        label: clamp(safeText(crawledPage.title, "page heading")),
        selector: "title",
        metadataJson: JSON.stringify({
          stage: "step1_information_architecture",
          level: 1,
          id: null,
          fallback: true,
        }),
      });
    }

    if ((!STRUCTURE_ONLY_ANALYSIS || ENABLE_INTERACTION_IN_STRUCTURE_MODE) && !hasInteraction && crawledPage.discoveredLinks.length > 0) {
      crawledPage.discoveredLinks.slice(0, 6).forEach((link, idx) => {
        drafts.push({
          pageId,
          componentType: "interaction",
          label: clamp(`auto_link_${idx + 1}`),
          selector: "a",
          metadataJson: JSON.stringify({
            stage: "step2_interaction_structure",
            actionType: "navigate",
            destination: link,
            resolvedDestination: link,
            href: link,
            confidence: "medium",
            id: null,
            className: null,
            fallback: true,
          }),
        });
      });
    }
  });

  const deduped = new Map<string, ComponentDraft>();
  for (const draft of drafts) {
    let key = `${draft.componentType}-${(draft.label || "").toLowerCase().trim()}-${draft.selector || ""}`;
    if (draft.componentType === "info_block") {
      const meta = parseJson<Record<string, unknown>>(draft.metadataJson, {});
      const blockKind = normalizeForKey(String(meta.blockKind || ""));
      const semanticTitle = normalizeForKey(String(meta.semanticTitle || draft.label || ""));
      const ancestor = normalizeForKey(String(meta.nearestSemanticAncestor || "root"));
      key = `info_block-${blockKind}-${semanticTitle}-${ancestor}`;
    }
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

  const pageById = new Map(pageRecords.map((page) => [page.id, page]));
  const viewNodes = new Map<string, ViewGraphNode>();
  const viewEdges: ViewGraphEdge[] = [];
  const intentByPage = new Map<
    string,
    { discover: number; evaluate: number; convert: number; conversionSignals: string[] }
  >();

  pageRecords.forEach((page) => {
    viewNodes.set(`page:${page.id}`, {
      id: `page:${page.id}`,
      pageId: page.id,
      nodeType: "page",
      label: page.title || page.url,
      url: page.url,
    });
    intentByPage.set(page.id, { discover: 0, evaluate: 0, convert: 0, conversionSignals: [] });
  });

  components
    .filter((component) => component.componentType === "interaction")
    .forEach((component) => {
      const parsed = parseJson<{
        actionType?: string;
        destination?: string | null;
        resolvedDestination?: string | null;
      }>(component.metadataJson, {});
      const actionType = parsed.actionType || "trigger_ui";
      const destination = parsed.resolvedDestination || parsed.destination || null;
      const intent = inferIntentFromInteraction(actionType, component.label || "", destination);
      const stat = intentByPage.get(component.pageId);
      if (stat) {
        stat[intent] += 1;
        if (intent === "convert" && component.label) {
          stat.conversionSignals.push(component.label);
        }
      }
    });

  components
    .filter((component) => component.componentType === "view_state")
    .forEach((component, index) => {
      const parsed = parseJson<{ stateType?: string; destination?: string | null }>(component.metadataJson, {});
      const nodeId = `view:${component.pageId}:${toSlug(component.label || `state_${index + 1}`)}`;
      viewNodes.set(nodeId, {
        id: nodeId,
        pageId: component.pageId,
        nodeType: "view_state",
        label: component.label || "view_state",
      });

      viewEdges.push({
        from: `page:${component.pageId}`,
        to: nodeId,
        edgeType: "state_change",
        actionType: parsed.stateType || "trigger_ui",
      });

      if (parsed.destination) {
        const targetPage = pageRecords.find((page) => page.url === parsed.destination);
        if (targetPage) {
          viewEdges.push({
            from: nodeId,
            to: `page:${targetPage.id}`,
            edgeType: "navigate",
            actionType: "navigate",
          });
        }
      }
    });

  sitemapEdges.forEach((edge) => {
    if (!edge.toPageId) return;
    viewEdges.push({
      from: `page:${edge.fromPageId}`,
      to: `page:${edge.toPageId}`,
      edgeType: "navigate",
      actionType: "navigate",
    });
  });

  const intentPages = Array.from(intentByPage.entries()).map(([pageId, score]) => {
    const page = pageById.get(pageId);
    const maxIntent = (["discover", "evaluate", "convert"] as const).reduce((best, current) =>
      score[current] > score[best] ? current : best
    );
    return {
      pageId,
      url: page?.url || "",
      title: page?.title || "",
      scores: score,
      primaryIntent: maxIntent,
      conversionSignals: Array.from(new Set(score.conversionSignals)).slice(0, 8),
    };
  });

  const globalIntentCounts = intentPages.reduce(
    (acc, page) => {
      acc[page.primaryIntent] += 1;
      return acc;
    },
    { discover: 0, evaluate: 0, convert: 0 }
  );

  const edgeOutByFrom = new Map<string, string[]>();
  sitemapEdges.forEach((edge) => {
    if (!edge.toPageId) return;
    const list = edgeOutByFrom.get(edge.fromPageId) || [];
    list.push(edge.toPageId);
    edgeOutByFrom.set(edge.fromPageId, list);
  });

  const rootPageId = pageRecords.find((page) => page.url === normalizedTargetUrl)?.id || pageRecords[0]?.id || "";

  const representativeFlows: FlowCandidate[] = [];
  const pushFlow = (intent: "discover" | "evaluate" | "convert", targetPageId: string) => {
    if (!rootPageId || !targetPageId) return;
    if (rootPageId === targetPageId) return;
    const direct = edgeOutByFrom.get(rootPageId) || [];
    const hasDirect = direct.includes(targetPageId);
    const path = hasDirect ? [rootPageId, targetPageId] : [rootPageId];
    if (!hasDirect) {
      const oneHop = direct.find((mid) => (edgeOutByFrom.get(mid) || []).includes(targetPageId));
      if (oneHop) path.push(oneHop);
      path.push(targetPageId);
    }
    representativeFlows.push({
      id: `flow_${intent}_${representativeFlows.length + 1}`,
      intent,
      path,
    });
  };

  const topByIntent = (intent: "discover" | "evaluate" | "convert") =>
    [...intentPages]
      .filter((page) => page.primaryIntent === intent)
      .sort((a, b) => (b.scores?.[intent] || 0) - (a.scores?.[intent] || 0))[0];

  const discoverTop = topByIntent("discover");
  const evaluateTop = topByIntent("evaluate");
  const convertTop = topByIntent("convert");
  if (discoverTop) pushFlow("discover", discoverTop.pageId);
  if (evaluateTop) pushFlow("evaluate", evaluateTop.pageId);
  if (convertTop) pushFlow("convert", convertTop.pageId);

  const confidence = {
    pageCoverage: Math.min(1, pageRecords.length / Math.max(3, MAX_ANALYZE_PAGES)),
    stateCoverage:
      components.filter((c) => c.componentType === "view_state").length > 0
        ? Math.min(
            1,
            components.filter((c) => c.componentType === "view_state").length / Math.max(4, pageRecords.length)
          )
        : 0.2,
    conversionPath:
      components.filter((c) => c.componentType === "conversion_point").length > 0
        ? Math.min(
            1,
            components.filter((c) => c.componentType === "conversion_point").length / Math.max(3, pageRecords.length)
          )
        : 0.2,
    intent:
      intentPages.length > 0
        ? Math.min(
            1,
            intentPages.filter((p) => (p.scores?.discover || 0) + (p.scores?.evaluate || 0) + (p.scores?.convert || 0) > 0)
              .length / intentPages.length
          )
        : 0.2,
  };

  const confidenceReasons: string[] = [];
  if (pageRecords.length < 3) confidenceReasons.push("too_few_pages_crawled");
  if (components.filter((c) => c.componentType === "view_state").length === 0)
    confidenceReasons.push("stateful_ui_detected_but_no_view_state");
  if (components.filter((c) => c.componentType === "conversion_point").length === 0)
    confidenceReasons.push("no_explicit_conversion_point_detected");
  if (sitemapEdges.length > pageRecords.length * 2) confidenceReasons.push("too_many_parallel_links");

  const promotedInteractionsByPage = new Map<string, Array<{ actionType: string; label: string; destination: string | null }>>();
  components
    .filter((component) => component.componentType === "interaction")
    .forEach((component) => {
      const meta = parseJson<{ actionType?: string; destination?: string | null; resolvedDestination?: string | null }>(
        component.metadataJson,
        {}
      );
      const list = promotedInteractionsByPage.get(component.pageId) || [];
      list.push({
        actionType: meta.actionType || "trigger_ui",
        label: component.label || "interaction",
        destination: meta.resolvedDestination || meta.destination || null,
      });
      promotedInteractionsByPage.set(component.pageId, list);
    });

  const sectionSequenceByPage = new Map<
    string,
    Array<{
      sectionType: string;
      sectionLabel: string;
      sectionGoal: string;
      keyActions: string[];
      order: number;
    }>
  >();
  const sectionStructure = pageRecords.map((page) => {
    const orderedInfoBlocks = components
      .filter((component) => component.pageId === page.id && component.componentType === "info_block")
      .map((component) => {
        const meta = parseJson<{
          blockKind?: string;
          semanticTitle?: string;
          interactionSummary?: { actions?: Record<string, number> };
          buttonCount?: number;
          linkCount?: number;
          order?: number;
        }>(component.metadataJson, {});
        const actions = Object.keys(meta.interactionSummary?.actions || {});
        return {
          sectionType: meta.blockKind || "content_section",
          sectionLabel: meta.semanticTitle || component.label || "section",
          sectionGoal: inferSectionGoal(meta.blockKind || "content_section"),
          keyActions: actions.slice(0, 5),
          order: Number(meta.order || 999),
          weight: (meta.buttonCount || 0) * 2 + (meta.linkCount || 0) + actions.length,
        };
      })
      .sort((a, b) => (a.order === b.order ? b.weight - a.weight : a.order - b.order))
      .slice(0, 12);

    sectionSequenceByPage.set(page.id, orderedInfoBlocks);

    const summary = [...orderedInfoBlocks]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((item) => {
        const { weight: _weight, order: _order, ...rest } = item;
        void _weight;
        void _order;
        return rest as SectionSummary;
      });

    return {
      pageId: page.id,
      url: page.url,
      sections: summary,
    };
  });

  const pageClassification: PageClassification[] = pageRecords.map((page) => {
    const sectionLabels = (sectionSequenceByPage.get(page.id) || []).map((section) => section.sectionLabel);
    const pageType = classifyPageType(page.url, page.title || "", sectionLabels);
    const ctas = getPrimaryCtasFromSections(sectionLabels);
    return {
      pageId: page.id,
      url: page.url,
      title: page.title || "",
      pageType,
      pageGoal: inferPageGoal(pageType, sectionLabels),
      primaryCta: ctas.primary,
      secondaryCta: ctas.secondary,
    };
  });

  const pageTypeById = new Map(pageClassification.map((page) => [page.pageId, page.pageType]));
  const coreUserFlows: Array<{
    flowId: string;
    flowType: string;
    pageIds: string[];
    pages: Array<{ pageId: string; url: string; title: string; pageType: string }>;
  }> = [];

  const mapPathToPages = (path: string[]) =>
    path.map((pageId) => {
      const page = pageById.get(pageId);
      return {
        pageId,
        url: page?.url || "",
        title: page?.title || "",
        pageType: pageTypeById.get(pageId) || "other",
      };
    });

  const rootCandidates =
    pageClassification
      .filter((page) => page.pageType === "main")
      .map((page) => page.pageId)
      .slice(0, 2) || [];
  const rootId = rootCandidates[0] || rootPageId;

  if (rootId) {
    const conversionTargets = new Set(
      pageClassification
        .filter((page) => ["purchase", "checkout", "sign_up", "form", "complete"].includes(page.pageType))
        .map((page) => page.pageId)
    );
    const conversionPath = findShortestPath(rootId, edgeOutByFrom, (pageId) => conversionTargets.has(pageId));
    if (conversionPath.length >= 2) {
      coreUserFlows.push({
        flowId: "flow_conversion_primary",
        flowType: "conversion",
        pageIds: conversionPath,
        pages: mapPathToPages(conversionPath),
      });
    }

    const browseTargets = new Set(
      pageClassification.filter((page) => ["plp", "list", "pdp", "detail"].includes(page.pageType)).map((page) => page.pageId)
    );
    const browsePath = findShortestPath(rootId, edgeOutByFrom, (pageId) => browseTargets.has(pageId));
    if (browsePath.length >= 2) {
      coreUserFlows.push({
        flowId: "flow_browse_primary",
        flowType: "browse",
        pageIds: browsePath,
        pages: mapPathToPages(browsePath),
      });
    }

    const authTargets = new Set(
      pageClassification.filter((page) => ["login", "sign_up"].includes(page.pageType)).map((page) => page.pageId)
    );
    const authPath = findShortestPath(rootId, edgeOutByFrom, (pageId) => authTargets.has(pageId));
    if (authPath.length >= 2) {
      coreUserFlows.push({
        flowId: "flow_auth_primary",
        flowType: "auth",
        pageIds: authPath,
        pages: mapPathToPages(authPath),
      });
    }
  }

  const pageSectionMap = pageRecords.map((page) => ({
    pageId: page.id,
    url: page.url,
    title: page.title || "",
    sections: (sectionSequenceByPage.get(page.id) || []).map((section, idx) => ({
      order: idx + 1,
      sectionType: section.sectionType,
      sectionLabel: section.sectionLabel,
      sectionGoal: section.sectionGoal,
    })),
  }));

  const result = {
    analyzeMode: "deep",
    analysisScope:
      STRUCTURE_ONLY_ANALYSIS && ENABLE_INTERACTION_IN_STRUCTURE_MODE
        ? "page_section_and_interaction"
        : STRUCTURE_ONLY_ANALYSIS
        ? "page_and_section_only"
        : "full",
    analysisFramework: {
      stage1: "raw_structure_generation",
      stage2: "not_used_in_structure_analysis",
    },
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
    page_graph: {
      nodes: pageRecords.map((page) => ({ id: page.id, url: page.url, title: page.title || page.url })),
      edges: sitemapEdges,
    },
    view_graph: {
      nodeCount: viewNodes.size,
      edgeCount: viewEdges.length,
      nodes: Array.from(viewNodes.values()),
      edges: viewEdges,
    },
    intent_structure: {
      globalIntentCounts,
      pages: intentPages,
      funnelStages: ["discover", "evaluate", "convert"],
      focusPoints: intentPages
        .filter((page) => page.conversionSignals.length > 0)
        .slice(0, 6)
        .map((page) => ({
          pageId: page.pageId,
          url: page.url,
          conversionSignals: page.conversionSignals,
        })),
      representativeFlows: representativeFlows.map((flow) => ({
        ...flow,
        pathPages: flow.path.map((pageId) => {
          const page = pageById.get(pageId);
          return {
            pageId,
            url: page?.url || "",
            title: page?.title || "",
          };
        }),
      })),
      confidence,
      confidenceReasons,
    },
    page_classification: pageClassification,
    section_structure: sectionStructure,
    menu_structure: {
      source:
        extractedMenuTrees.length > 0
          ? rootMenuProbeHtmls.length > 0
            ? "header_nav_parser_with_menu_probe"
            : "header_nav_parser"
          : "fallback_url_tree",
      nodeCount: extractedMenuTrees.length,
      sections: extractedMenu.sections.map((section) => ({
        sectionType: section.sectionType,
        title: section.title,
        nodeCount: section.trees.length,
        trees: annotateMenuNodesWithPageType(section.trees, (url) => inferPageTypeFromUrl(url)),
      })),
      trees: annotateMenuNodesWithPageType(extractedMenuTrees, (url) => inferPageTypeFromUrl(url)),
    },
    page_section_map: pageSectionMap,
    core_user_flows: coreUserFlows,
    raw_structure: {
      page_candidates: pageRecords.map((page) => ({
        pageId: page.id,
        url: page.url,
        title: page.title || "",
        pageType: page.pageType || null,
      })),
      page_link_graph: {
        nodes: pageRecords.map((page) => ({
          id: page.id,
          url: page.url,
          title: page.title || page.url,
        })),
        edges: sitemapEdges.map((edge) => ({
          fromPageId: edge.fromPageId,
          toPageId: edge.toPageId,
        })),
      },
      section_candidates: sectionStructure,
    },
    crawlDiagnostics,
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

    const access = await requireProjectAccess(id, { write: true });
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const job = await prisma.analyzeJob.create({
      data: {
        projectId: id,
        initiatedByUserId: access.user.id,
        status: "queued",
        progress: 0,
      },
    });

    await logActivity({
      name: "analysis_started",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { jobId: job.id },
    });

    setTimeout(() => {
      void processAnalyzeJob(job.id);
    }, 0);

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: job.status,
      mode: "deep",
    });
  } catch (error: unknown) {
    console.error("Analyze Job Create Error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
