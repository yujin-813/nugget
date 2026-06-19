import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

type ParsedComponent = {
  id: string;
  componentType: string;
  label: string | null;
  selector: string | null;
  metadataJson: string | null;
};

type InteractionItem = {
  label: string;
  actionType: string;
  destination: string | null;
  confidence: "high" | "medium" | "low";
};

type SitemapEdge = {
  fromPageId: string;
  toPageId: string;
};

type SitemapOverride = {
  nodes: Array<{ id: string; url: string; title: string }>;
  edges: SitemapEdge[];
};

type Step1InformationArchitecture = {
  infoBlocks: Array<{
    label: string;
    blockKind: string;
    order: number | null;
    linkCount: number;
    buttonCount: number;
    subsectionCount: number;
  }>;
  headings: string[];
  urlPath: string;
};

type Step2InteractionStructure = {
  interactions: InteractionItem[];
  totals: {
    navigate: number;
    open_modal: number;
    open_dropdown: number;
    open_tab: number;
    open_popup: number;
    download: number;
    form_submit: number;
    trigger_ui: number;
  };
};

type Step3ConversionStructure = {
  businessGoal: string;
  scenario: string[];
  keyConversionPoints: string[];
  weakPoints: string[];
};

type Step4UxEvaluation = {
  ctaConcentration: string;
  navigationDispersion: string;
  firstScreenValueProposition: string;
  interpretationSummary: string;
};

type AnalyzeIntentStructure = {
  pages?: Array<{
    pageId: string;
    url: string;
    title?: string;
    scores?: { discover?: number; evaluate?: number; convert?: number };
    primaryIntent?: "discover" | "evaluate" | "convert";
    conversionSignals?: string[];
  }>;
  focusPoints?: Array<{
    pageId: string;
    url: string;
    conversionSignals?: string[];
  }>;
  globalIntentCounts?: { discover?: number; evaluate?: number; convert?: number };
};

type AnalyzeViewGraph = {
  nodes?: Array<{ id: string; pageId: string; nodeType: "page" | "view_state"; label: string; url?: string }>;
  edges?: Array<{ from: string; to: string; edgeType: "navigate" | "state_change"; actionType?: string }>;
};

type AnalyzeResult = {
  intent_structure?: AnalyzeIntentStructure;
  view_graph?: AnalyzeViewGraph;
  page_classification?: Array<{
    pageId: string;
    pageType?: string;
    pageGoal?: string;
    primaryCta?: string | null;
    secondaryCta?: string | null;
  }>;
  section_structure?: Array<{
    pageId: string;
    sections?: Array<{ sectionType?: string; sectionLabel?: string; keyActions?: string[] }>;
  }>;
};

type EventDraft = {
  projectId: string;
  pageId: string;
  eventName: string;
  eventCode?: string;
  description: string;
  triggerType: string;
  triggerCondition: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "draft";
  sourceType: "ai" | "ga4_recommended" | "custom_ai";
  parameterTemplates?: EventParamTemplate[];
  contextParams?: EventParamTemplate[];
};

type Ga4Template = {
  eventName: string;
  reason: string;
};

type EventParamTemplate = {
  propertyName: string;
  propertyType: string;
  exampleValue: string;
  isRequired: boolean;
};

type PageIntentHint = {
  primaryIntent: "discover" | "evaluate" | "convert";
  conversionSignals: string[];
  viewStateCount: number;
  pageType?: string;
  pageGoal?: string;
  primaryCta?: string | null;
};

type LlmUsageStats = {
  enabled: boolean;
  usedLlm: boolean;
  model: string | null;
  provider?: "openai" | "ollama";
  approxInputTokens: number;
  approxOutputTokens: number;
  compressedInfoBlocks: number;
  compressedInteractions: number;
  llmMode?: "budget" | "balanced" | "deep";
  maxInputTokensPerPage?: number;
  maxOutputTokensPerPage?: number;
  inputCapped?: boolean;
};

type LlmMode = "budget" | "balanced" | "deep";
type LlmProvider = "openai" | "ollama";
type SiteType = "ecommerce" | "leadgen" | "content" | "subscription" | "general";

type LlmBuildOptions = {
  llmMode: LlmMode;
  llmProvider: LlmProvider;
  maxInputTokensPerPage: number;
  maxOutputTokensPerPage: number;
  siteType?: SiteType;
};

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function inferSiteType(
  analysisGoal: string,
  analyzeResult: AnalyzeResult | null,
  pageUrls: string[]
): SiteType {
  const goal = (analysisGoal || "").toLowerCase();
  const urlText = pageUrls.join(" ").toLowerCase();
  const pageTypes = (analyzeResult?.page_classification || [])
    .map((p) => String(p.pageType || "").toLowerCase())
    .join(" ");
  const haystack = `${goal} ${urlText} ${pageTypes}`;

  if (
    /(checkout|purchase|cart|product|pdp|plp|goods|shop|order|결제|구매|장바구니|상품|후원|기부|donat|donation)/.test(
      haystack
    )
  ) {
    return "ecommerce";
  }
  if (/(lead|contact|inquiry|form|demo|consult|문의|상담|신청)/.test(haystack)) return "leadgen";
  if (/(sign.?up|register|join|membership|subscription|구독|회원가입|가입)/.test(haystack)) return "subscription";
  if (/(article|content|blog|news|insight|review|콘텐츠|아티클|인사이트)/.test(haystack)) return "content";
  return "general";
}

function getSiteTypeGuidance(siteType: SiteType) {
  if (siteType === "ecommerce") {
    return "Prioritize commerce funnel events: list view, item view, cart, checkout, purchase.";
  }
  if (siteType === "leadgen") {
    return "Prioritize lead funnel events: CTA click, form start/submit, lead generation.";
  }
  if (siteType === "subscription") {
    return "Prioritize membership funnel events: sign_up, login, subscribe/checkout completion.";
  }
  if (siteType === "content") {
    return "Prioritize content engagement events: content selection, detail view, key CTA transitions.";
  }
  return "Prioritize clear user-intent events and avoid over-generic names.";
}

function evaluateEventQuality(eventNames: string[], siteType: SiteType) {
  const names = new Set(eventNames.map((name) => normalizeEventName(name)));
  const genericOnly = [...names].every((name) =>
    ["page_view", "click", "file_download", "ux_cta_concentration_checked", "ux_navigation_dispersion_checked"].includes(name)
  );
  const requiredBySiteType: Record<SiteType, string[]> = {
    ecommerce: ["view_item_list", "view_item", "view_cart", "begin_checkout", "purchase"],
    leadgen: ["generate_lead", "submit_form", "click_cta"],
    content: ["select_content", "view_item", "click_cta"],
    subscription: ["sign_up", "login", "begin_checkout", "purchase"],
    general: ["click_cta", "select_content", "generate_lead"],
  };
  const required = requiredBySiteType[siteType];
  const hitCount = required.filter((req) => [...names].some((n) => n === req || n.startsWith(`${req}_`))).length;
  return {
    genericOnly,
    hitCount,
    requiredCount: required.length,
    score: hitCount - (genericOnly ? 2 : 0),
  };
}

function buildPageIntentHint(
  analyzeResult: AnalyzeResult | null,
  pageId: string
): PageIntentHint | null {
  if (!analyzeResult?.intent_structure) return null;
  const pageIntent = analyzeResult.intent_structure.pages?.find((page) => page.pageId === pageId);
  if (!pageIntent) return null;
  const viewStateCount =
    analyzeResult.view_graph?.nodes?.filter((node) => node.pageId === pageId && node.nodeType === "view_state").length || 0;
  return {
    primaryIntent: pageIntent.primaryIntent || "discover",
    conversionSignals: pageIntent.conversionSignals || [],
    viewStateCount,
    pageType: analyzeResult.page_classification?.find((page) => page.pageId === pageId)?.pageType,
    pageGoal: analyzeResult.page_classification?.find((page) => page.pageId === pageId)?.pageGoal,
    primaryCta: analyzeResult.page_classification?.find((page) => page.pageId === pageId)?.primaryCta || null,
  };
}

function computeInteractionTotals(interactions: InteractionItem[]) {
  return {
    navigate: interactions.filter((i) => i.actionType === "navigate").length,
    open_modal: interactions.filter((i) => i.actionType === "open_modal").length,
    open_dropdown: interactions.filter((i) => i.actionType === "open_dropdown").length,
    open_tab: interactions.filter((i) => i.actionType === "open_tab").length,
    open_popup: interactions.filter((i) => i.actionType === "open_popup").length,
    download: interactions.filter((i) => i.actionType === "download").length,
    form_submit: interactions.filter((i) => i.actionType === "form_submit").length,
    trigger_ui: interactions.filter((i) => i.actionType === "trigger_ui").length,
  };
}

function slugify(input: string, fallback: string) {
  const normalized = (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  return normalized.length > 0 ? normalized : fallback;
}

const EVENT_NAME_MAX = 40;
const RESERVED_EVENT_PREFIXES = ["firebase_", "ga_", "google_", "gtag."];

function normalizeEventName(raw: string, fallback = "custom_event"): string {
  let value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!value) value = fallback;
  if (!/^[a-z]/.test(value)) value = `e_${value}`;
  if (RESERVED_EVENT_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    value = `custom_${value}`;
  }
  return value.slice(0, EVENT_NAME_MAX);
}

function toBaseEventName(eventName: string) {
  const baseCandidates = [
    "select_content",
    "click_cta",
    "select_option",
    "toggle_filter",
    "file_download",
    "submit_form",
    "generate_lead",
    "view_promotion",
    "select_promotion",
    "dismiss_promotion",
  ];
  for (const base of baseCandidates) {
    if (eventName === base || eventName.startsWith(`${base}_`)) return base;
  }
  return eventName;
}

function inferContentType(eventName: string) {
  if (eventName.startsWith("select_content")) return "content";
  if (eventName.startsWith("click_cta")) return "cta";
  if (eventName.startsWith("select_option")) return "option";
  if (eventName.startsWith("toggle_filter")) return "filter";
  if (eventName.startsWith("view_promotion")) return "promotion_view";
  if (eventName.startsWith("select_promotion")) return "promotion_select";
  if (eventName.startsWith("dismiss_promotion")) return "promotion_dismiss";
  if (eventName.startsWith("file_download")) return "download";
  if (eventName.startsWith("submit_form")) return "form_submit";
  if (eventName.startsWith("generate_lead")) return "lead";
  return "content";
}

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function pickBusinessObjectToken(label: string, destination?: string | null) {
  const source = `${label || ""} ${destination || ""}`
    .toLowerCase()
    .replace(/후원/g, " donate ")
    .replace(/기부/g, " donate ")
    .replace(/정기후원/g, " recurring_donate ")
    .replace(/일시후원/g, " one_time_donate ")
    .replace(/결제/g, " payment ")
    .replace(/구매/g, " purchase ");
  const tokens = source
    .replace(/https?:\/\/[^/\s]+/g, " ")
    .replace(/[^a-z0-9가-힣/_\-\s]+/g, " ")
    .split(/[\s/_-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const stopwords = new Set([
    "click",
    "button",
    "menu",
    "nav",
    "open",
    "close",
    "view",
    "select",
    "submit",
    "download",
    "go",
    "to",
    "and",
    "the",
    "a",
    "an",
    "www",
    "com",
    "html",
    "php",
    "kr",
    "ko",
    "en",
    "로그인",
    "회원가입",
    "버튼",
    "클릭",
    "이동",
    "메뉴",
    "페이지",
  ]);
  const meaningful = tokens.find((t) => t.length >= 2 && !stopwords.has(t));
  return meaningful ? slugify(meaningful, "item").slice(0, 14) : "item";
}

function isCtaLabel(label: string) {
  return hasKeyword(label, [
    "cta",
    "start",
    "signup",
    "sign_up",
    "sign-up",
    "join",
    "trial",
    "buy",
    "purchase",
    "contact",
    "lead",
    "apply",
    "신청",
    "문의",
    "가입",
    "시작",
    "체험",
    "도입",
    "구매",
    "결제",
    "상담",
  ]);
}

function inferSemanticEventName(interaction: InteractionItem) {
  const label = (interaction.label || "").toLowerCase();
  const obj = pickBusinessObjectToken(interaction.label || "", interaction.destination);
  const isFilter = hasKeyword(label, ["filter", "facet", "필터"]);
  const isOption = hasKeyword(label, ["option", "select", "dropdown", "checkbox", "라디오", "옵션", "선택"]);
  const isPopup = hasKeyword(label, ["popup", "banner", "promo", "promotion", "팝업", "배너", "프로모션"]);
  const isDismiss = hasKeyword(label, ["close", "dismiss", "skip", "닫기", "건너뛰기"]);
  const isLead = hasKeyword(label, ["contact", "lead", "request", "demo", "문의", "상담", "도입", "신청"]);

  switch (interaction.actionType) {
    case "download":
      return `file_download_${obj}`;
    case "form_submit":
      return isLead ? `generate_lead_${obj}` : `submit_form_${obj}`;
    case "navigate":
      return isCtaLabel(label) ? `click_cta_${obj}` : `select_content_${obj}`;
    case "open_dropdown":
      return isFilter ? `toggle_filter_${obj}` : `select_option_${obj}`;
    case "open_tab":
      return `select_option_${obj}`;
    case "open_modal":
      return isCtaLabel(label) ? `click_cta_${obj}` : `select_content_${obj}`;
    case "open_popup":
      if (isDismiss) return `dismiss_promotion_${obj}`;
      return isPopup ? `select_promotion_${obj}` : `view_promotion_${obj}`;
    default:
      if (isFilter) return `toggle_filter_${obj}`;
      if (isOption) return `select_option_${obj}`;
      return isCtaLabel(label) ? `click_cta_${obj}` : `select_content_${obj}`;
  }
}

function buildEventCode(index: number) {
  return `EVT_${String(index + 1).padStart(4, "0")}`;
}

function buildParameterTemplates(
  draft: EventDraft,
  pagePath: string
): EventParamTemplate[] {
  const templates: EventParamTemplate[] = [
    {
      propertyName: "event_code",
      propertyType: "string",
      exampleValue: draft.eventCode || "",
      isRequired: true,
    },
    {
      propertyName: "page_path",
      propertyType: "string",
      exampleValue: pagePath || "/",
      isRequired: true,
    },
    {
      propertyName: "event_source",
      propertyType: "string",
      exampleValue: draft.sourceType,
      isRequired: true,
    },
  ];

  if (draft.sourceType === "ga4_recommended") {
    templates.push(
      {
        propertyName: "ga_session_id",
        propertyType: "number",
        exampleValue: "1745123412",
        isRequired: false,
      },
      {
        propertyName: "engagement_time_msec",
        propertyType: "number",
        exampleValue: "100",
        isRequired: false,
      }
    );
  }

  if (["click", "navigate", "open_modal", "open_dropdown", "open_popup"].includes(draft.triggerType)) {
    templates.push(
      {
        propertyName: "element_label",
        propertyType: "string",
        exampleValue: "hero_cta",
        isRequired: false,
      },
      {
        propertyName: "destination_url",
        propertyType: "string",
        exampleValue: "https://example.com/next",
        isRequired: false,
      }
    );
  }

  if (draft.triggerType === "form_submit") {
    templates.push(
      {
        propertyName: "form_id",
        propertyType: "string",
        exampleValue: "signup_form",
        isRequired: true,
      },
      {
        propertyName: "form_name",
        propertyType: "string",
        exampleValue: "newsletter_signup",
        isRequired: false,
      }
    );
  }

  if (draft.triggerType === "download") {
    templates.push(
      {
        propertyName: "file_name",
        propertyType: "string",
        exampleValue: "pricing_guide.pdf",
        isRequired: true,
      },
      {
        propertyName: "file_extension",
        propertyType: "string",
        exampleValue: "pdf",
        isRequired: true,
      }
    );
  }

  if (draft.contextParams?.length) {
    templates.push(...draft.contextParams);
  }

  const ecommerceParams = (() => {
    const name = normalizeEventName(draft.eventName);
    const is = (target: string) => name === target || name.startsWith(`${target}_`);
    const sharedItemParams: EventParamTemplate[] = [
      {
        propertyName: "item_id",
        propertyType: "string",
        exampleValue: "sku_12345",
        isRequired: false,
      },
      {
        propertyName: "item_name",
        propertyType: "string",
        exampleValue: "donation_plan",
        isRequired: false,
      },
      {
        propertyName: "item_brand",
        propertyType: "string",
        exampleValue: "brand_name",
        isRequired: false,
      },
      {
        propertyName: "item_variant",
        propertyType: "string",
        exampleValue: "default",
        isRequired: false,
      },
      {
        propertyName: "item_category",
        propertyType: "string",
        exampleValue: "donation",
        isRequired: false,
      },
      {
        propertyName: "item_category2",
        propertyType: "string",
        exampleValue: "subscription",
        isRequired: false,
      },
      {
        propertyName: "item_category3",
        propertyType: "string",
        exampleValue: "monthly",
        isRequired: false,
      },
      {
        propertyName: "price",
        propertyType: "number",
        exampleValue: "10000",
        isRequired: false,
      },
      {
        propertyName: "quantity",
        propertyType: "number",
        exampleValue: "1",
        isRequired: false,
      },
      {
        propertyName: "currency",
        propertyType: "string",
        exampleValue: "KRW",
        isRequired: false,
      },
      {
        propertyName: "value",
        propertyType: "number",
        exampleValue: "10000",
        isRequired: false,
      },
      {
        propertyName: "discount",
        propertyType: "number",
        exampleValue: "0",
        isRequired: false,
      },
    ];

    if (is("view_item_list")) {
      return [
        {
          propertyName: "item_list_id",
          propertyType: "string",
          exampleValue: "home_featured",
          isRequired: false,
        },
        {
          propertyName: "item_list_name",
          propertyType: "string",
          exampleValue: "featured_items",
          isRequired: false,
        },
        {
          propertyName: "index",
          propertyType: "number",
          exampleValue: "1",
          isRequired: false,
        },
        ...sharedItemParams,
      ];
    }

    if (is("view_item") || is("view_cart") || is("add_to_cart") || is("remove_from_cart")) {
      return sharedItemParams;
    }

    if (is("begin_checkout")) {
      return [
        ...sharedItemParams,
        {
          propertyName: "affiliation",
          propertyType: "string",
          exampleValue: "web_store",
          isRequired: false,
        },
        {
          propertyName: "payment_type",
          propertyType: "string",
          exampleValue: "card",
          isRequired: false,
        },
        {
          propertyName: "coupon",
          propertyType: "string",
          exampleValue: "WELCOME10",
          isRequired: false,
        },
        {
          propertyName: "donation_type",
          propertyType: "string",
          exampleValue: "one_time",
          isRequired: false,
        },
        {
          propertyName: "donation_frequency",
          propertyType: "string",
          exampleValue: "monthly",
          isRequired: false,
        },
      ];
    }

    if (is("purchase")) {
      return [
        ...sharedItemParams,
        {
          propertyName: "transaction_id",
          propertyType: "string",
          exampleValue: "ORD-20260401-0001",
          isRequired: true,
        },
        {
          propertyName: "tax",
          propertyType: "number",
          exampleValue: "0",
          isRequired: false,
        },
        {
          propertyName: "shipping",
          propertyType: "number",
          exampleValue: "0",
          isRequired: false,
        },
        {
          propertyName: "shipping_tier",
          propertyType: "string",
          exampleValue: "standard",
          isRequired: false,
        },
        {
          propertyName: "affiliation",
          propertyType: "string",
          exampleValue: "web_store",
          isRequired: false,
        },
        {
          propertyName: "payment_type",
          propertyType: "string",
          exampleValue: "card",
          isRequired: false,
        },
        {
          propertyName: "coupon",
          propertyType: "string",
          exampleValue: "WELCOME10",
          isRequired: false,
        },
        {
          propertyName: "donation_type",
          propertyType: "string",
          exampleValue: "one_time",
          isRequired: false,
        },
        {
          propertyName: "donation_frequency",
          propertyType: "string",
          exampleValue: "monthly",
          isRequired: false,
        },
        {
          propertyName: "campaign_id",
          propertyType: "string",
          exampleValue: "spring_campaign_2026",
          isRequired: false,
        },
      ];
    }

    return [] as EventParamTemplate[];
  })();
  templates.push(...ecommerceParams);

  const userPropertyTemplates: EventParamTemplate[] = [
    {
      propertyName: "user_login_status",
      propertyType: "string",
      exampleValue: "logged_out",
      isRequired: false,
    },
    {
      propertyName: "user_signup_method",
      propertyType: "string",
      exampleValue: "email",
      isRequired: false,
    },
    {
      propertyName: "user_plan_tier",
      propertyType: "string",
      exampleValue: "free",
      isRequired: false,
    },
    {
      propertyName: "user_customer_type",
      propertyType: "string",
      exampleValue: "new",
      isRequired: false,
    },
    {
      propertyName: "user_region",
      propertyType: "string",
      exampleValue: "KR-11",
      isRequired: false,
    },
    {
      propertyName: "user_lifecycle_stage",
      propertyType: "string",
      exampleValue: "awareness",
      isRequired: false,
    },
  ];
  templates.push(...userPropertyTemplates);

  const deduped = new Map<string, EventParamTemplate>();
  templates.forEach((template) => {
    const propertyName = String(template.propertyName || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .slice(0, 40);
    const normalizedTemplate: EventParamTemplate = {
      ...template,
      propertyName,
      exampleValue: String(template.exampleValue || "").slice(0, 100),
    };
    if (propertyName && !deduped.has(propertyName)) {
      deduped.set(propertyName, normalizedTemplate);
    }
  });

  return Array.from(deduped.values()).slice(0, 25);
}

function enrichDraftsWithCodesAndTemplates(
  drafts: EventDraft[],
  pagePath: string,
  startIndex = 0
): EventDraft[] {
  return drafts.map((draft, index) => {
    const eventCode = buildEventCode(startIndex + index);
    const eventName = normalizeEventName(draft.eventName);
    return {
      ...draft,
      eventName,
      eventCode,
      parameterTemplates: buildParameterTemplates({ ...draft, eventName, eventCode }, pagePath),
    };
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Failed to recommend events";
}

function safeArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

function parseJsonFromText<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildStep1InformationArchitecture(components: ParsedComponent[], pageUrl: string): Step1InformationArchitecture {
  const infoBlocks = components
    .filter((c) => c.componentType === "info_block")
    .map((block) => {
      const meta = parseJson<{
        blockKind?: string;
        order?: number;
        linkCount?: number;
        buttonCount?: number;
        subsectionCount?: number;
      }>(block.metadataJson, {});

      return {
        label: block.label || "정보블록",
        blockKind: meta.blockKind || "section",
        order: meta.order ?? null,
        linkCount: meta.linkCount || 0,
        buttonCount: meta.buttonCount || 0,
        subsectionCount: meta.subsectionCount || 0,
      };
    })
    .sort((a, b) => (a.order || 999) - (b.order || 999));

  const headings = components
    .filter((c) => c.componentType === "heading")
    .map((h) => h.label || "")
    .filter(Boolean)
    .slice(0, 10);

  let urlPath = pageUrl;
  const urlComp = components.find((c) => c.componentType === "url");
  if (urlComp) {
    const meta = parseJson<{ pathname?: string }>(urlComp.metadataJson, {});
    if (meta.pathname) urlPath = meta.pathname;
  }

  return { infoBlocks, headings, urlPath };
}

function buildStep2InteractionStructure(components: ParsedComponent[]): Step2InteractionStructure {
  const interactions: InteractionItem[] = components
    .filter((c) => c.componentType === "interaction")
    .map((item) => {
      const meta = parseJson<{
        actionType?: string;
        destination?: string | null;
        confidence?: "high" | "medium" | "low";
      }>(item.metadataJson, {});

      return {
        label: item.label || "interaction",
        actionType: meta.actionType || "trigger_ui",
        destination: meta.destination || null,
        confidence: meta.confidence || "low",
      };
    });

  const totals = computeInteractionTotals(interactions);

  return { interactions, totals };
}

function buildStep3ConversionStructure(
  analysisGoal: string,
  step1: Step1InformationArchitecture,
  step2: Step2InteractionStructure,
  intentHint?: PageIntentHint | null
): Step3ConversionStructure {
  const scenario: string[] = [
    `유입: ${step1.urlPath}`,
    "정보구조 스캔: 상단 가치 제안/핵심 섹션 파악",
  ];
  if (intentHint?.pageType) {
    scenario.push(`페이지 분류: ${intentHint.pageType}`);
  }
  if (intentHint?.pageGoal) {
    scenario.push(`페이지 목적: ${intentHint.pageGoal}`);
  }

  if (step2.totals.open_modal > 0 || step2.totals.open_dropdown > 0 || step2.totals.open_tab > 0) {
    scenario.push("관심 심화: 상세 정보 탐색(모달/드롭다운)");
  }

  if (step2.totals.navigate > 0) {
    scenario.push("행동 전환: 주요 링크 이동");
  }

  if (step2.totals.form_submit > 0) {
    scenario.push("의도 확정: 폼 제출");
  }

  if (step2.totals.download > 0) {
    scenario.push("자료 획득: 다운로드 완료");
  }
  if (intentHint?.viewStateCount && intentHint.viewStateCount > 0) {
    scenario.push(`상태 전환: URL 변화 없이 ${intentHint.viewStateCount}개 view state 관찰`);
  }

  const keyConversionPoints: string[] = [];

  const ctaCandidates = step2.interactions.filter((i) => {
    const label = i.label.toLowerCase();
    return /(신청|문의|구매|결제|시작|가입|예약|다운로드|상담|buy|start|signup|sign_up|contact)/.test(label);
  });

  ctaCandidates.slice(0, 8).forEach((point) => {
    keyConversionPoints.push(`${point.label} (${point.actionType})`);
  });

  if (keyConversionPoints.length === 0 && step2.interactions.length > 0) {
    step2.interactions.slice(0, 5).forEach((point) => {
      keyConversionPoints.push(`${point.label} (${point.actionType})`);
    });
  }
  if (intentHint?.conversionSignals?.length) {
    intentHint.conversionSignals.slice(0, 6).forEach((signal) => {
      if (!keyConversionPoints.some((point) => point.includes(signal))) {
        keyConversionPoints.push(`${signal} (intent_signal)`);
      }
    });
  }
  if (intentHint?.primaryCta && !keyConversionPoints.some((point) => point.includes(intentHint.primaryCta || ""))) {
    keyConversionPoints.unshift(`${intentHint.primaryCta} (primary_cta)`);
  }

  const weakPoints: string[] = [];
  if (step2.totals.form_submit === 0) weakPoints.push("명시적인 제출형 전환 지점(form_submit)이 없음");
  if (step2.totals.navigate > 20) weakPoints.push("네비게이션 대상이 많아 전환 동선이 분산될 가능성");
  if (step1.infoBlocks.length < 2) weakPoints.push("정보 덩어리 구분이 적어 단계형 설득 구조가 약할 수 있음");
  if (intentHint?.primaryIntent === "discover" && step2.totals.form_submit === 0 && step2.totals.download === 0) {
    weakPoints.push("탐색형 동선 중심으로 보이며 명확한 전환 액션이 약함");
  }

  return {
    businessGoal: analysisGoal,
    scenario,
    keyConversionPoints,
    weakPoints,
  };
}

function buildStep4UxEvaluation(
  step1: Step1InformationArchitecture,
  step2: Step2InteractionStructure,
  step3: Step3ConversionStructure
): Step4UxEvaluation {
  const labelFrequency = new Map<string, number>();
  step2.interactions.forEach((i) => {
    const key = i.label.toLowerCase();
    labelFrequency.set(key, (labelFrequency.get(key) || 0) + 1);
  });

  const topLabelCount = Math.max(0, ...Array.from(labelFrequency.values()));
  const totalInteractions = Math.max(1, step2.interactions.length);
  const concentrationRatio = topLabelCount / totalInteractions;

  const ctaConcentration = concentrationRatio >= 0.25
    ? `CTA가 일부 라벨에 집중됨 (${Math.round(concentrationRatio * 100)}%)`
    : `CTA가 넓게 분산됨 (${Math.round(concentrationRatio * 100)}%)`;

  const navigationInteractions = step2.interactions.filter((i) => i.actionType === "navigate");
  const uniqueDestinations = new Set(navigationInteractions.map((i) => i.destination || "unknown")).size;
  const navigationDispersionRatio = navigationInteractions.length === 0
    ? 0
    : uniqueDestinations / navigationInteractions.length;

  const navigationDispersion = navigationInteractions.length === 0
    ? "탐지된 네비게이션 인터랙션이 거의 없음"
    : navigationDispersionRatio > 0.7
      ? `네비게이션이 분산됨 (고유 목적지 ${uniqueDestinations}개)`
      : `네비게이션이 상대적으로 집중됨 (고유 목적지 ${uniqueDestinations}개)`;

  const hasTopValueHeading = step1.headings.length > 0;
  const hasHeroLikeBlock = step1.infoBlocks.some((b) => b.blockKind === "rolling_banner" || b.blockKind === "section_1");

  const firstScreenValueProposition = hasTopValueHeading && hasHeroLikeBlock
    ? `첫 화면 가치 제안이 비교적 명확함 (헤딩 '${step1.headings[0]}')`
    : hasTopValueHeading
      ? "첫 화면 헤딩은 있으나 대표 섹션 구조 해석이 약함"
      : "첫 화면에서 가치 제안 헤딩이 약해 보임";

  return {
    ctaConcentration,
    navigationDispersion,
    firstScreenValueProposition,
    interpretationSummary: `전환 포인트 ${step3.keyConversionPoints.length}개, 약점 ${step3.weakPoints.length}개 식별`,
  };
}

function estimateTokensFromText(text: string) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function compressStep1ForLlm(step1: Step1InformationArchitecture) {
  const prioritized = [...step1.infoBlocks].sort((a, b) => {
    const aScore = a.linkCount + a.buttonCount * 2 + a.subsectionCount;
    const bScore = b.linkCount + b.buttonCount * 2 + b.subsectionCount;
    return bScore - aScore;
  });

  return {
    urlPath: step1.urlPath,
    headings: step1.headings.slice(0, 5),
    infoBlocks: prioritized.slice(0, 8).map((b) => ({
      label: b.label,
      blockKind: b.blockKind,
      order: b.order,
      linkCount: b.linkCount,
      buttonCount: b.buttonCount,
      subsectionCount: b.subsectionCount,
    })),
  };
}

function compressStep2ForLlm(step2: Step2InteractionStructure) {
  const scored = [...step2.interactions].sort((a, b) => {
    const actionWeight = (item: InteractionItem) => {
      if (item.actionType === "form_submit") return 5;
      if (item.actionType === "download") return 4;
      if (item.actionType === "navigate") return 3;
      if (item.actionType === "open_modal" || item.actionType === "open_popup") return 2;
      return 1;
    };
    return actionWeight(b) - actionWeight(a);
  });

  return {
    totals: step2.totals,
    interactions: scored.slice(0, 20).map((i) => ({
      label: i.label.slice(0, 40),
      actionType: i.actionType,
      destination: (i.destination || "").slice(0, 80) || null,
      confidence: i.confidence,
    })),
  };
}

function getLlmCompressionBudget(llmMode: LlmMode) {
  if (llmMode === "deep") {
    return { headingLimit: 6, infoBlockLimit: 12, interactionLimit: 28 };
  }
  if (llmMode === "balanced") {
    return { headingLimit: 5, infoBlockLimit: 8, interactionLimit: 20 };
  }
  return { headingLimit: 3, infoBlockLimit: 5, interactionLimit: 12 };
}

async function buildStep3And4WithLLM(
  analysisGoal: string,
  step1: Step1InformationArchitecture,
  step2: Step2InteractionStructure,
  fallbackStep3: Step3ConversionStructure,
  fallbackStep4: Step4UxEvaluation,
  intentHint?: PageIntentHint | null,
  options?: LlmBuildOptions
): Promise<{ step3: Step3ConversionStructure; step4: Step4UxEvaluation; usage: LlmUsageStats }> {
  const llmProvider: LlmProvider = options?.llmProvider || "openai";
  const siteType: SiteType = options?.siteType || "general";
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const model =
    llmProvider === "ollama"
      ? process.env.OLLAMA_MODEL || "qwen2.5:14b-instruct"
      : process.env.OPENAI_MODEL || "gpt-5-mini";
  const llmMode: LlmMode = options?.llmMode || "budget";
  const maxInputTokensPerPage = Math.max(300, options?.maxInputTokensPerPage || 1200);
  const maxOutputTokensPerPage = Math.max(150, options?.maxOutputTokensPerPage || 500);
  const compressionBudget = getLlmCompressionBudget(llmMode);
  const compressedStep1Base = compressStep1ForLlm(step1);
  const compressedStep2Base = compressStep2ForLlm(step2);
  let compressedStep1 = {
    ...compressedStep1Base,
    headings: compressedStep1Base.headings.slice(0, compressionBudget.headingLimit),
    infoBlocks: compressedStep1Base.infoBlocks.slice(0, compressionBudget.infoBlockLimit),
  };
  let compressedStep2 = {
    ...compressedStep2Base,
    interactions: compressedStep2Base.interactions.slice(0, compressionBudget.interactionLimit),
  };

  const llmAvailable =
    llmProvider === "openai"
      ? Boolean(openaiApiKey)
      : Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);

  if (!llmAvailable) {
    return {
      step3: fallbackStep3,
      step4: fallbackStep4,
      usage: {
        enabled: false,
        usedLlm: false,
        model: null,
        provider: llmProvider,
        approxInputTokens: 0,
        approxOutputTokens: 0,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
        llmMode,
        maxInputTokensPerPage,
        maxOutputTokensPerPage,
        inputCapped: false,
      },
    };
  }

  const buildPromptPayload = () => ({
    analysisGoal,
    siteType,
    step1: compressedStep1,
    step2: compressedStep2,
    structureContext: {
      pageIntent: intentHint?.primaryIntent || null,
      viewStateCount: intentHint?.viewStateCount || 0,
      conversionSignals: intentHint?.conversionSignals || [],
    },
    instruction: {
      step3: "비즈니스 목표 기준 전환구조를 시나리오 형태로 설계",
      step4: "CTA 집중/네비게이션 분산/첫화면 가치제안을 근거 기반으로 평가",
      siteTypeGuidance: getSiteTypeGuidance(siteType),
      output: "반드시 JSON만 반환",
    },
    outputSchema: {
      step3: {
        businessGoal: "string",
        scenario: ["string"],
        keyConversionPoints: ["string"],
        weakPoints: ["string"],
      },
      step4: {
        ctaConcentration: "string",
        navigationDispersion: "string",
        firstScreenValueProposition: "string",
        interpretationSummary: "string",
      },
    },
  });

  let promptPayload = buildPromptPayload();
  let promptText = JSON.stringify(promptPayload);
  let approxInputTokens = estimateTokensFromText(promptText);
  let inputCapped = false;

  const minInfoBlocks = 2;
  const minInteractions = 5;
  while (
    approxInputTokens > maxInputTokensPerPage &&
    (compressedStep1.infoBlocks.length > minInfoBlocks || compressedStep2.interactions.length > minInteractions)
  ) {
    inputCapped = true;
    if (compressedStep2.interactions.length > minInteractions) {
      compressedStep2 = {
        ...compressedStep2,
        interactions: compressedStep2.interactions.slice(0, Math.max(minInteractions, Math.floor(compressedStep2.interactions.length * 0.75))),
      };
    }
    if (compressedStep1.infoBlocks.length > minInfoBlocks) {
      compressedStep1 = {
        ...compressedStep1,
        infoBlocks: compressedStep1.infoBlocks.slice(0, Math.max(minInfoBlocks, Math.floor(compressedStep1.infoBlocks.length * 0.75))),
      };
    }
    promptPayload = buildPromptPayload();
    promptText = JSON.stringify(promptPayload);
    approxInputTokens = estimateTokensFromText(promptText);
  }
  if (approxInputTokens > maxInputTokensPerPage) inputCapped = true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const systemPrompt = "You are a UX analytics strategist. Return strict JSON only. No markdown. No explanation.";
    let res: Response;
    if (llmProvider === "ollama") {
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
      res = await fetch(`${ollamaBaseUrl.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: false,
          options: { num_predict: maxOutputTokensPerPage },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(promptPayload) },
          ],
        }),
        signal: controller.signal,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          max_output_tokens: maxOutputTokensPerPage,
          input: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: JSON.stringify(promptPayload),
            },
          ],
        }),
        signal: controller.signal,
      });
    }
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        step3: fallbackStep3,
        step4: fallbackStep4,
        usage: {
          enabled: true,
          usedLlm: false,
          model,
          provider: llmProvider,
          approxInputTokens,
          approxOutputTokens: 0,
          compressedInfoBlocks: compressedStep1.infoBlocks.length,
          compressedInteractions: compressedStep2.interactions.length,
          llmMode,
          maxInputTokensPerPage,
          maxOutputTokensPerPage,
          inputCapped,
        },
      };
    }

    const data = (await res.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
      message?: { content?: string };
    };

    const outputText =
      llmProvider === "ollama"
        ? data.message?.content || ""
        : data.output_text ||
          data.output?.flatMap((o) => o.content || []).find((c) => c.type === "output_text")?.text ||
          "";
    const approxOutputTokens = estimateTokensFromText(outputText);

    const parsed = parseJsonFromText<{
      step3?: {
        businessGoal?: string;
        scenario?: unknown;
        keyConversionPoints?: unknown;
        weakPoints?: unknown;
      };
      step4?: {
        ctaConcentration?: string;
        navigationDispersion?: string;
        firstScreenValueProposition?: string;
        interpretationSummary?: string;
      };
    }>(outputText);

    if (!parsed?.step3 || !parsed?.step4) {
      return {
        step3: fallbackStep3,
        step4: fallbackStep4,
        usage: {
          enabled: true,
          usedLlm: false,
          model,
          provider: llmProvider,
          approxInputTokens,
          approxOutputTokens,
          compressedInfoBlocks: compressedStep1.infoBlocks.length,
          compressedInteractions: compressedStep2.interactions.length,
          llmMode,
          maxInputTokensPerPage,
          maxOutputTokensPerPage,
          inputCapped,
        },
      };
    }

    const step3: Step3ConversionStructure = {
      businessGoal: parsed.step3.businessGoal?.trim() || fallbackStep3.businessGoal,
      scenario: safeArray(parsed.step3.scenario).slice(0, 8),
      keyConversionPoints: safeArray(parsed.step3.keyConversionPoints).slice(0, 12),
      weakPoints: safeArray(parsed.step3.weakPoints).slice(0, 8),
    };

    const step4: Step4UxEvaluation = {
      ctaConcentration: parsed.step4.ctaConcentration?.trim() || fallbackStep4.ctaConcentration,
      navigationDispersion: parsed.step4.navigationDispersion?.trim() || fallbackStep4.navigationDispersion,
      firstScreenValueProposition:
        parsed.step4.firstScreenValueProposition?.trim() || fallbackStep4.firstScreenValueProposition,
      interpretationSummary: parsed.step4.interpretationSummary?.trim() || fallbackStep4.interpretationSummary,
    };

    if (step3.scenario.length === 0) step3.scenario = fallbackStep3.scenario;
    if (step3.keyConversionPoints.length === 0) step3.keyConversionPoints = fallbackStep3.keyConversionPoints;
    if (step3.weakPoints.length === 0) step3.weakPoints = fallbackStep3.weakPoints;

    return {
      step3,
      step4,
      usage: {
        enabled: true,
        usedLlm: true,
        model,
        provider: llmProvider,
        approxInputTokens,
        approxOutputTokens,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
        llmMode,
        maxInputTokensPerPage,
        maxOutputTokensPerPage,
        inputCapped,
      },
    };
  } catch {
    return {
      step3: fallbackStep3,
      step4: fallbackStep4,
      usage: {
        enabled: true,
        usedLlm: false,
        model,
        provider: llmProvider,
        approxInputTokens,
        approxOutputTokens: 0,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
        llmMode,
        maxInputTokensPerPage,
        maxOutputTokensPerPage,
        inputCapped,
      },
    };
  }
}

function buildToolTemplates(
  toolType: string,
  step2: Step2InteractionStructure,
  step3: Step3ConversionStructure,
  intentHint?: PageIntentHint | null,
  pageUrl?: string,
  options?: {
    hasPurchaseCompletionPage?: boolean;
    hasCommerceFunnelSignals?: boolean;
  }
): Ga4Template[] {
  const normalizedToolType = toolType === "amplitude" ? "amplitude" : "ga4";
  const templates: Ga4Template[] =
    normalizedToolType === "amplitude"
      ? [
          { eventName: "session_start", reason: "Amplitude session entry baseline" },
          { eventName: "page_view", reason: "Amplitude web baseline page view" },
          { eventName: "button_click", reason: "UI interaction baseline for amplitude tracking plan" },
          { eventName: "form_submit", reason: "Conversion capture for form flow" },
          { eventName: "file_download", reason: "Download action baseline" },
        ]
      : [
          { eventName: "page_view", reason: "GA4 기본 이벤트" },
          { eventName: "click", reason: "GA4 Enhanced Measurement (링크/아웃바운드 클릭 계열)" },
          { eventName: "file_download", reason: "다운로드 액션 추적" },
        ];

  const allText = [
    ...step2.interactions.map((i) => i.label.toLowerCase()),
    ...step3.keyConversionPoints.map((p) => p.toLowerCase()),
  ].join(" ");
  const pageTypeFromIntent = String(intentHint?.pageType || "").toLowerCase();
  const urlHint = String(pageUrl || "").toLowerCase();
  const hasPurchaseCompletionPage = Boolean(options?.hasPurchaseCompletionPage);
  const hasCommerceFunnelSignals = Boolean(options?.hasCommerceFunnelSignals);
  const inferredPageTypeFromUrl =
    /(checkout|payment|결제|주문|donat|donation|sponsor|fund|후원|기부)/.test(urlHint)
      ? "checkout"
      : /(purchase|order-complete|thank.?you|구매완료|주문완료|후원완료|기부완료|complete)/.test(urlHint)
      ? "purchase"
      : /(cart|bag|basket|장바구니)/.test(urlHint)
      ? "cart"
      : /(product|goods|item|pdp|detail|article)/.test(urlHint)
      ? "pdp"
      : /(category|collection|products|shop|plp|list|contents)/.test(urlHint)
      ? "plp"
      : "";
  const pageType = pageTypeFromIntent || inferredPageTypeFromUrl;

  if (/(가입|회원가입|sign.?up|register)/.test(allText)) {
    templates.push({ eventName: "sign_up", reason: "가입 전환 지점 존재" });
  }
  if (/(로그인|login|sign.?in)/.test(allText)) {
    templates.push({ eventName: "login", reason: "로그인 전환 지점 존재" });
  }
  if (/(add.?to.?cart|cart.?add|장바구니.?담기|담기|카트.?추가|cart)/.test(allText)) {
    templates.push({ eventName: "add_to_cart", reason: "장바구니 담기/추가 액션 존재" });
  }
  if (/(checkout|begin.?checkout|결제하기|주문하기|후원하기|구매하기)/.test(allText)) {
    if (normalizedToolType === "amplitude") {
      templates.push({ eventName: "checkout_started", reason: "체크아웃 진입 CTA/신호 존재" });
    } else {
      templates.push({ eventName: "begin_checkout", reason: "체크아웃 진입 CTA/신호 존재" });
    }
  }
  if (/(구매|결제|checkout|buy|order|donat|donation|sponsor|fund|후원|기부)/.test(allText)) {
    if (normalizedToolType === "amplitude") {
      templates.push({ eventName: "checkout_started", reason: "결제 시작 시점 추적" });
      templates.push({ eventName: "purchase_completed", reason: "최종 구매 전환 추적" });
    } else {
      templates.push({ eventName: "begin_checkout", reason: "결제/구매 흐름 존재" });
      templates.push({ eventName: "purchase", reason: "최종 구매 전환 추적" });
    }
  }
  if (/(문의|상담|lead|contact|신청)/.test(allText)) {
    templates.push({
      eventName: normalizedToolType === "amplitude" ? "lead_submitted" : "generate_lead",
      reason: "문의/리드 전환 지점 존재",
    });
  }
  if (/(검색|search)/.test(allText)) {
    templates.push({ eventName: "search", reason: "검색 의도 행동 추적" });
  }

  if (hasPurchaseCompletionPage) {
    templates.push({
      eventName: normalizedToolType === "amplitude" ? "purchase_completed" : "purchase",
      reason: "완료/thank-you 페이지 감지",
    });
  }

  // Reinforce ecommerce templates using page classification (when UI labels are generic).
  if (normalizedToolType === "ga4") {
    if (/(plp|list|category|collection)/.test(pageType)) {
      templates.push({ eventName: "view_item_list", reason: "목록형 페이지 탐색" });
    }
    if (/(pdp|detail|product|article)/.test(pageType)) {
      templates.push({ eventName: "view_item", reason: "상세 페이지 조회" });
    }
    if (/(cart)/.test(pageType)) {
      templates.push({ eventName: "view_cart", reason: "장바구니 페이지" });
      templates.push({
        eventName: "begin_checkout",
        reason: "장바구니 단계 감지 (체크아웃 진입 후보)",
      });
    }
    if (/(checkout)/.test(pageType)) {
      templates.push({ eventName: "begin_checkout", reason: "체크아웃 페이지 진입" });
    }
    if (/(purchase|complete|order_complete)/.test(pageType)) {
      templates.push({ eventName: "purchase", reason: "구매 완료 페이지" });
    }
    if (!hasPurchaseCompletionPage && hasCommerceFunnelSignals && /(cart|checkout)/.test(pageType)) {
      templates.push({
        eventName: "purchase",
        reason: "전자상거래/후원 퍼널 감지 (완료 페이지 수동 매핑 필요)",
      });
    }
  } else {
    if (/(cart|checkout|purchase|complete|order_complete)/.test(pageType)) {
      templates.push({ eventName: "checkout_started", reason: "전자상거래 단계 페이지 감지" });
      if (/(purchase|complete|order_complete)/.test(pageType)) {
        templates.push({ eventName: "purchase_completed", reason: "구매 완료 단계 감지" });
      }
    }
  }

  const deduped = new Map<string, Ga4Template>();
  templates.forEach((t) => {
    if (!deduped.has(t.eventName)) deduped.set(t.eventName, t);
  });

  return Array.from(deduped.values());
}

function designEvents(
  projectId: string,
  pageId: string,
  pageTitle: string,
  step1: Step1InformationArchitecture,
  toolType: string,
  step2: Step2InteractionStructure,
  step4: Step4UxEvaluation,
  ga4Templates: Ga4Template[],
  intentHint?: PageIntentHint | null
): EventDraft[] {
  const drafts: EventDraft[] = [];
  const normalizedToolType = toolType === "amplitude" ? "amplitude" : "ga4";

  drafts.push({
    projectId,
    pageId,
    eventName: normalizeEventName(normalizedToolType === "amplitude" ? "session_start" : "page_view"),
    description: `${pageTitle} 진입`,
    triggerType: "load",
    triggerCondition: "User lands on the page",
    priority: "HIGH",
    status: "draft",
    sourceType: "ga4_recommended",
  });

  ga4Templates
    .filter((g) => g.eventName !== "page_view" && g.eventName !== "session_start")
    .forEach((template) => {
      drafts.push({
        projectId,
        pageId,
        eventName: normalizeEventName(template.eventName),
        description: `[${normalizedToolType.toUpperCase()}] ${template.reason}`,
        triggerType: "derived",
        triggerCondition: `Derived from interaction signals (${template.eventName})`,
        priority: "MEDIUM",
        status: "draft",
        sourceType: "ga4_recommended",
      });
    });

  const groupedBySemanticName = new Map<
    string,
    {
      eventName: string;
      labels: string[];
      destinations: string[];
      actionTypes: string[];
      count: number;
    }
  >();

  step2.interactions.slice(0, 40).forEach((interaction) => {
    const semanticName = normalizeEventName(inferSemanticEventName(interaction));
    const baseEventName = toBaseEventName(semanticName);
    const existing =
      groupedBySemanticName.get(baseEventName) ||
      { eventName: baseEventName, labels: [], destinations: [], actionTypes: [], count: 0 };

    if (interaction.label && !existing.labels.includes(interaction.label)) {
      existing.labels.push(interaction.label);
    }
    if (interaction.destination && !existing.destinations.includes(interaction.destination)) {
      existing.destinations.push(interaction.destination);
    }
    if (!existing.actionTypes.includes(interaction.actionType)) {
      existing.actionTypes.push(interaction.actionType);
    }
    existing.count += 1;

    groupedBySemanticName.set(baseEventName, existing);
  });

  const isHighPriorityName = (name: string) =>
    /^(generate_lead|purchase|begin_checkout|sign_up|login|submit_form|click_cta)(_|$)/.test(name);

  const buildContextParams = (
    eventName: string,
    labels: string[],
    destinations: string[],
    count: number
  ): EventParamTemplate[] => {
    const firstLabel = labels[0] || "cta_button";
    const pageCategory = intentHint?.pageType || slugify(pageTitle || "page", "page");
    const params: EventParamTemplate[] = [
      {
        propertyName: "item_id",
        propertyType: "string",
        exampleValue: slugify(firstLabel, "item"),
        isRequired: false,
      },
      {
        propertyName: "item_name",
        propertyType: "string",
        exampleValue: firstLabel,
        isRequired: false,
      },
      {
        propertyName: "slot_index",
        propertyType: "number",
        exampleValue: "1",
        isRequired: false,
      },
      {
        propertyName: "list_name",
        propertyType: "string",
        exampleValue: slugify(pageTitle || "main", "main"),
        isRequired: false,
      },
      {
        propertyName: "sample_count",
        propertyType: "number",
        exampleValue: String(count),
        isRequired: false,
      },
      {
        propertyName: "content_label",
        propertyType: "string",
        exampleValue: firstLabel,
        isRequired: false,
      },
      {
        propertyName: "content_type",
        propertyType: "string",
        exampleValue: inferContentType(eventName),
        isRequired: false,
      },
      {
        propertyName: "content_category",
        propertyType: "string",
        exampleValue: pageCategory,
        isRequired: false,
      },
    ];

    if (destinations.length > 0 || eventName === "select_content") {
      params.push({
        propertyName: "destination_url",
        propertyType: "string",
        exampleValue: destinations[0] || "https://example.com/next",
        isRequired: false,
      });
    }

    if (eventName === "toggle_filter" || eventName === "select_option") {
      params.push({
        propertyName: "option_name",
        propertyType: "string",
        exampleValue: firstLabel,
        isRequired: false,
      });
    }

    if (["view_promotion", "select_promotion", "dismiss_promotion"].includes(eventName)) {
      params.push(
        {
          propertyName: "popup_id",
          propertyType: "string",
          exampleValue: slugify(firstLabel, "popup"),
          isRequired: false,
        },
        {
          propertyName: "popup_type",
          propertyType: "string",
          exampleValue: "modal",
          isRequired: false,
        },
        {
          propertyName: "placement",
          propertyType: "string",
          exampleValue: "hero",
          isRequired: false,
        }
      );
    }

    return params;
  };

  groupedBySemanticName.forEach((group) => {
    const triggerType =
      group.actionTypes[0] ||
      (group.eventName === "file_download" ? "download" : group.eventName === "submit_form" ? "form_submit" : "trigger_ui");

    drafts.push({
      projectId,
      pageId,
      eventName: group.eventName,
      description: `${group.eventName} derived from ${group.count} interaction(s)`,
      triggerType,
      triggerCondition: group.destinations.length
        ? `Users interact with ${group.labels.slice(0, 3).join(", ")} and may move to ${group.destinations.slice(0, 2).join(", ")}`
        : `Users interact with ${group.labels.slice(0, 3).join(", ")} (${group.actionTypes.join(", ")})`,
      priority:
        isHighPriorityName(group.eventName) ||
        (intentHint?.primaryIntent === "convert" && ["select_content", "click_cta"].includes(group.eventName))
          ? "HIGH"
          : "MEDIUM",
      status: "draft",
      sourceType: "custom_ai",
      contextParams: buildContextParams(group.eventName, group.labels, group.destinations, group.count),
    });
  });

  // Structural fallback: when click-level interactions are sparse, still produce actionable events.
  if (groupedBySemanticName.size < 2) {
    const pageType = intentHint?.pageType || "";
    const primaryCtaToken = pickBusinessObjectToken(intentHint?.primaryCta || pageTitle, null);
    const structuralCandidates: string[] = [];
    if (/(plp|list|category)/i.test(pageType)) structuralCandidates.push("view_item_list");
    if (/(pdp|detail|product|article)/i.test(pageType)) structuralCandidates.push("view_item");
    if (/(cart)/i.test(pageType)) structuralCandidates.push("view_cart");
    if (/(checkout)/i.test(pageType)) structuralCandidates.push("begin_checkout");
    if (/(purchase|complete|order_complete)/i.test(pageType)) structuralCandidates.push("purchase");
    if (/(login)/i.test(pageType)) structuralCandidates.push("login");
    if (/(sign_up|signup|register)/i.test(pageType)) structuralCandidates.push("sign_up");
    if (/(form|lead|contact)/i.test(pageType)) structuralCandidates.push("generate_lead");
    if (intentHint?.primaryCta) structuralCandidates.push(`click_cta_${primaryCtaToken}`);
    if (step1.infoBlocks.some((block) => /gnb|nav|menu/i.test(block.blockKind))) {
      structuralCandidates.push("view_navigation_menu");
    }

    Array.from(new Set(structuralCandidates))
      .slice(0, 4)
      .forEach((name) => {
        drafts.push({
          projectId,
          pageId,
          eventName: normalizeEventName(name),
          description: `${name} derived from page structure`,
          triggerType: "derived",
          triggerCondition: "Derived from page type / section structure",
          priority: "MEDIUM",
          status: "draft",
          sourceType: "custom_ai",
        });
      });
  }

  drafts.push({
    projectId,
    pageId,
    eventName: normalizeEventName("ux_cta_concentration_checked"),
    description: `[UX평가] ${step4.ctaConcentration}`,
    triggerType: "derived",
    triggerCondition: "Evaluate CTA concentration status",
    priority: "LOW",
    status: "draft",
    sourceType: "custom_ai",
  });

  drafts.push({
    projectId,
    pageId,
    eventName: normalizeEventName("ux_navigation_dispersion_checked"),
    description: `[UX평가] ${step4.navigationDispersion}`,
    triggerType: "derived",
    triggerCondition: "Evaluate navigation dispersion status",
    priority: "LOW",
    status: "draft",
    sourceType: "custom_ai",
  });

  const deduped = new Map<string, EventDraft>();
  drafts.forEach((draft) => {
    const eventName = normalizeEventName(draft.eventName);
    if (!deduped.has(eventName)) {
      deduped.set(eventName, { ...draft, eventName });
    }
  });

  return Array.from(deduped.values());
}

function priorityScore(priority: EventDraft["priority"]) {
  if (priority === "HIGH") return 3;
  if (priority === "MEDIUM") return 2;
  return 1;
}

function dedupeProjectEventsByName(drafts: EventDraft[]): EventDraft[] {
  const merged = new Map<string, EventDraft>();
  drafts.forEach((draft) => {
    const eventName = normalizeEventName(draft.eventName);
    const existing = merged.get(eventName);
    if (!existing) {
      merged.set(eventName, { ...draft, eventName });
      return;
    }

    const keepExisting = priorityScore(existing.priority) >= priorityScore(draft.priority);
    const winner = keepExisting ? existing : { ...draft, eventName };
    const loser = keepExisting ? draft : existing;
    const mergedContextParams = [
      ...(winner.contextParams || []),
      ...(loser.contextParams || []),
    ];
    const dedupedParamMap = new Map<string, EventParamTemplate>();
    mergedContextParams.forEach((param) => {
      if (!dedupedParamMap.has(param.propertyName)) {
        dedupedParamMap.set(param.propertyName, param);
      }
    });
    merged.set(eventName, {
      ...winner,
      eventName,
      contextParams: Array.from(dedupedParamMap.values()),
    });
  });
  return Array.from(merged.values());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request
      .json()
      .catch(
        () =>
          ({} as {
            mode?: string;
            llmMode?: string;
            llmProvider?: string;
            maxInputTokensPerPage?: number;
            maxOutputTokensPerPage?: number;
            llmPageLimit?: number;
          })
      );
    const mode = body?.mode === "supplement" ? "supplement" : "replace";
    const llmMode: LlmMode = body?.llmMode === "deep" ? "deep" : body?.llmMode === "balanced" ? "balanced" : "budget";
    const llmProvider: LlmProvider = body?.llmProvider === "ollama" ? "ollama" : "openai";
    const maxInputTokensPerPage = Math.max(300, Number(body?.maxInputTokensPerPage || 1200));
    const maxOutputTokensPerPage = Math.max(150, Number(body?.maxOutputTokensPerPage || 500));
    const llmPageLimit = Math.max(0, Math.min(3, Number(body?.llmPageLimit ?? 1)));

    const params = await context.params;
    const { id } = params;

    const access = await requireProjectAccess(id, { write: true });
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        pages: {
          include: { components: true },
        },
      },
    });

    if (!project || project.pages.length === 0) {
      return NextResponse.json({ error: "No parsed pages found to generate events from" }, { status: 400 });
    }

    const latestAnalyzeJob = await prisma.analyzeJob.findFirst({
      where: { projectId: id, status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { id: true, resultJson: true },
    });
    const analyzeResult = parseJson<AnalyzeResult | null>(latestAnalyzeJob?.resultJson ?? null, null);

    const toolType = project.toolType || "ga4";
    const sitemapOverride = parseJson<SitemapOverride | null>(project.sitemapOverrideJson, null);
    const overrideEdgesByFromPage = new Map<string, string[]>();
    const overrideNodeById = new Map<string, { id: string; url: string; title: string }>();
    sitemapOverride?.nodes?.forEach((node) => {
      if (node?.id && node?.url) overrideNodeById.set(node.id, node);
    });
    if (sitemapOverride?.edges?.length) {
      sitemapOverride.edges.forEach((edge) => {
        const list = overrideEdgesByFromPage.get(edge.fromPageId) || [];
        list.push(edge.toPageId);
        overrideEdgesByFromPage.set(edge.fromPageId, list);
      });
    }
    const pagesForDesign = [...project.pages].sort((a, b) => (a.pageType === "main" ? -1 : 1) - (b.pageType === "main" ? -1 : 1));
    const siteType = inferSiteType(
      project.analysisGoal || "",
      analyzeResult,
      pagesForDesign.map((page) => page.url || "")
    );
    const hasPurchaseCompletionPage = pagesForDesign.some((page) => {
      const text = `${page.url || ""} ${page.title || ""}`.toLowerCase();
      return /(thank.?you|order-complete|purchase|success|complete|구매완료|주문완료|후원완료|결제완료|완료)/.test(text);
    });
    const hasCommerceFunnelSignals = pagesForDesign.some((page) => {
      const pageType = String(page.pageType || "").toLowerCase();
      if (["plp", "pdp", "cart", "checkout", "purchase"].includes(pageType)) return true;
      const text = `${page.url || ""} ${page.title || ""}`.toLowerCase();
      return /(cart|checkout|purchase|order|complete|product|goods|shop|donat|donation|sponsor|fund|후원|기부|결제|구매|장바구니|상품)/.test(text);
    });
    const perPagePipeline: Array<{
      pageId: string;
      pageTitle: string;
      pageUrl: string;
      infoBlockCount: number;
      interactionCount: number;
      step3: Step3ConversionStructure;
      step4: Step4UxEvaluation;
      designedEventCount: number;
      llmUsed: boolean;
      llmTokenLog: {
        approxInputTokens: number;
        approxOutputTokens: number;
        compressedInfoBlocks: number;
        compressedInteractions: number;
        llmMode: string | null;
        inputCapped: boolean;
      };
    }> = [];

    const usageTotal: LlmUsageStats = {
      enabled: llmProvider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : true,
      usedLlm: false,
      model: null,
      provider: llmProvider,
      approxInputTokens: 0,
      approxOutputTokens: 0,
      compressedInfoBlocks: 0,
      compressedInteractions: 0,
      llmMode,
      maxInputTokensPerPage,
      maxOutputTokensPerPage,
      inputCapped: false,
    };

    const eventsToCreate: EventDraft[] = [];

    for (let index = 0; index < pagesForDesign.length; index += 1) {
      const page = pagesForDesign[index];
      const components = page.components as ParsedComponent[];
      if (!components || components.length === 0) continue;

      const step1 = buildStep1InformationArchitecture(components, page.url);
      const baseStep2 = buildStep2InteractionStructure(components);
      const overrideTargets = overrideEdgesByFromPage.get(page.id) || [];
      const syntheticNavigateInteractions: InteractionItem[] = [];
      overrideTargets.forEach((toPageId, edgeIndex) => {
          const targetPage = pagesForDesign.find((candidate) => candidate.id === toPageId);
          const targetNode = overrideNodeById.get(toPageId);
          const destinationUrl = targetPage?.url || targetNode?.url;
          if (!destinationUrl) return;
          const targetLabel = targetPage?.title || targetNode?.title || "page";
          syntheticNavigateInteractions.push({
            label: `sitemap_to_${slugify(targetLabel, `p${edgeIndex + 1}`)}`,
            actionType: "navigate",
            destination: destinationUrl,
            confidence: "high" as const,
          });
        });
      const mergedInteractions = [...baseStep2.interactions, ...syntheticNavigateInteractions];
      const step2: Step2InteractionStructure = {
        interactions: mergedInteractions,
        totals: computeInteractionTotals(mergedInteractions),
      };
      const intentHint = buildPageIntentHint(analyzeResult, page.id);
      const fallbackStep3 = buildStep3ConversionStructure(project.analysisGoal, step1, step2, intentHint);
      const fallbackStep4 = buildStep4UxEvaluation(step1, step2, fallbackStep3);

      const llmResult =
        index < llmPageLimit
          ? await buildStep3And4WithLLM(project.analysisGoal, step1, step2, fallbackStep3, fallbackStep4, intentHint, {
              llmMode,
              llmProvider,
              maxInputTokensPerPage,
              maxOutputTokensPerPage,
              siteType,
            })
          : {
              step3: fallbackStep3,
              step4: fallbackStep4,
              usage: {
                enabled: llmProvider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : true,
                usedLlm: false,
                model: null,
                provider: llmProvider,
                approxInputTokens: 0,
                approxOutputTokens: 0,
                compressedInfoBlocks: 0,
                compressedInteractions: 0,
                llmMode,
                maxInputTokensPerPage,
                maxOutputTokensPerPage,
                inputCapped: false,
              } as LlmUsageStats,
            };
      let { step3, step4, usage } = llmResult;

      const buildDraftsForCurrentStep = (currentStep3: Step3ConversionStructure, currentStep4: Step4UxEvaluation) => {
        const ga4Templates = buildToolTemplates(toolType, step2, currentStep3, intentHint, page.url, {
          hasPurchaseCompletionPage,
          hasCommerceFunnelSignals,
        });
        return designEvents(
          project.id,
          page.id,
          page.title || "main",
          step1,
          toolType,
          step2,
          currentStep4,
          ga4Templates,
          intentHint
        );
      };

      let draftedEvents = buildDraftsForCurrentStep(step3, step4);
      let quality = evaluateEventQuality(draftedEvents.map((d) => d.eventName), siteType);

      const canRetryWithLlm =
        index < llmPageLimit && usage.enabled && llmMode !== "deep" && (quality.genericOnly || quality.score <= 0);
      if (canRetryWithLlm) {
        const retriedLlmMode: LlmMode = llmMode === "budget" ? "balanced" : "deep";
        const retried = await buildStep3And4WithLLM(project.analysisGoal, step1, step2, fallbackStep3, fallbackStep4, intentHint, {
          llmMode: retriedLlmMode,
          llmProvider,
          maxInputTokensPerPage: Math.round(maxInputTokensPerPage * 1.4),
          maxOutputTokensPerPage: Math.round(maxOutputTokensPerPage * 1.4),
          siteType,
        });
        const retriedDrafts = buildDraftsForCurrentStep(retried.step3, retried.step4);
        const retriedQuality = evaluateEventQuality(retriedDrafts.map((d) => d.eventName), siteType);
        if (retriedQuality.score >= quality.score) {
          step3 = retried.step3;
          step4 = retried.step4;
          usage = retried.usage;
          draftedEvents = retriedDrafts;
          quality = retriedQuality;
        }
      }

      usageTotal.usedLlm = usageTotal.usedLlm || usage.usedLlm;
      usageTotal.model = usageTotal.model || usage.model;
      usageTotal.provider = usageTotal.provider || usage.provider;
      usageTotal.approxInputTokens += usage.approxInputTokens;
      usageTotal.approxOutputTokens += usage.approxOutputTokens;
      usageTotal.compressedInfoBlocks += usage.compressedInfoBlocks;
      usageTotal.compressedInteractions += usage.compressedInteractions;
      usageTotal.inputCapped = Boolean(usageTotal.inputCapped || usage.inputCapped);

      const eventsForPage = enrichDraftsWithCodesAndTemplates(
        draftedEvents,
        step1.urlPath,
        eventsToCreate.length
      );
      eventsToCreate.push(...eventsForPage);

      perPagePipeline.push({
        pageId: page.id,
        pageTitle: page.title || "untitled",
        pageUrl: page.url,
        infoBlockCount: step1.infoBlocks.length,
        interactionCount: step2.interactions.length,
        step3,
        step4,
        designedEventCount: eventsForPage.length,
        llmUsed: usage.usedLlm,
        llmTokenLog: {
          approxInputTokens: usage.approxInputTokens,
          approxOutputTokens: usage.approxOutputTokens,
          compressedInfoBlocks: usage.compressedInfoBlocks,
          compressedInteractions: usage.compressedInteractions,
          llmMode: usage.llmMode || null,
          inputCapped: Boolean(usage.inputCapped),
        },
      });
    }

    const dedupedProjectEvents = dedupeProjectEventsByName(eventsToCreate);
    const recodedProjectEvents = dedupedProjectEvents.map((draft, idx) => {
      const eventCode = buildEventCode(idx);
      const existingPagePath =
        draft.parameterTemplates?.find((template) => template.propertyName === "page_path")?.exampleValue || "/";
      return {
        ...draft,
        eventName: normalizeEventName(draft.eventName),
        eventCode,
        parameterTemplates: buildParameterTemplates({ ...draft, eventCode }, existingPagePath),
      };
    });
    eventsToCreate.length = 0;
    eventsToCreate.push(...recodedProjectEvents);

    console.info("[LLM_USAGE]", usageTotal);

    const meaningfulStructureByPage = perPagePipeline.map((pageSummary) => {
      const pageClass = analyzeResult?.page_classification?.find((item) => item.pageId === pageSummary.pageId);
      return {
        pageId: pageSummary.pageId,
        pageUrl: pageSummary.pageUrl,
        pageType: pageClass?.pageType || "other",
        pageGoal: pageClass?.pageGoal || "",
        primaryCta: pageClass?.primaryCta || null,
        sectionInterpretation: pageSummary.step4?.interpretationSummary || "",
        representativeScenario: pageSummary.step3?.scenario?.slice(0, 5) || [],
        keyConversionPoints: pageSummary.step3?.keyConversionPoints?.slice(0, 6) || [],
      };
    });

    if (latestAnalyzeJob?.id) {
      const baseSnapshot = parseJson<Record<string, unknown>>(latestAnalyzeJob.resultJson, {});
      const nextSnapshot = {
        ...baseSnapshot,
        ai_interpretation: {
          updatedAt: new Date().toISOString(),
          framework: {
            stage1: "raw_structure_generation",
            stage2: "ai_meaningful_structure_interpretation",
          },
          event_design_policy: {
            eventNaming: "user_action_plus_business_object",
            contextInParameters: true,
            longNameAvoided: true,
          },
          llm_policy: {
            provider: llmProvider,
            mode: llmMode,
            llmPageLimit,
            maxInputTokensPerPage,
            maxOutputTokensPerPage,
          },
          meaningful_structure: {
            pageCount: meaningfulStructureByPage.length,
            pages: meaningfulStructureByPage,
          },
          llmUsage: usageTotal,
        },
      };

      await prisma.analyzeJob.update({
        where: { id: latestAnalyzeJob.id },
        data: { resultJson: JSON.stringify(nextSnapshot) },
      });
    }

    if (eventsToCreate.length === 0) {
      return NextResponse.json({ error: "No components found to design events" }, { status: 400 });
    }

    const { insertedCount, skippedCount } = await prisma.$transaction(async (tx) => {
      if (mode === "replace") {
        await tx.event.deleteMany({
          where: { projectId: project.id, sourceType: { in: ["ai", "ga4_recommended", "custom_ai"] } },
        });
      }

      const existingEvents = await tx.event.findMany({
        where: { projectId: project.id },
        select: { eventName: true },
      });
      const existingNameSet = new Set(existingEvents.map((e) => normalizeEventName(e.eventName)));

      const eventsToInsert =
        mode === "replace"
          ? eventsToCreate
          : eventsToCreate.filter((eventDraft) => !existingNameSet.has(normalizeEventName(eventDraft.eventName)));

      for (const eventDraft of eventsToInsert) {
        await tx.event.create({
          data: {
            projectId: eventDraft.projectId,
            pageId: eventDraft.pageId,
            eventName: eventDraft.eventName,
            description: eventDraft.description,
            triggerType: eventDraft.triggerType,
            triggerCondition: eventDraft.triggerCondition,
            priority: eventDraft.priority,
            status: eventDraft.status,
            sourceType: eventDraft.sourceType,
            properties: {
              create: (eventDraft.parameterTemplates || []).map((template) => ({
                propertyName: template.propertyName,
                propertyType: template.propertyType,
                exampleValue: template.exampleValue,
                isRequired: template.isRequired,
              })),
            },
          },
        });
      }
      return { insertedCount: eventsToInsert.length, skippedCount: eventsToCreate.length - eventsToInsert.length };
    });

    await logActivity({
      name: "result_viewed",
      userId: access.user.id,
      workspaceId: access.workspaceId,
      projectId: id,
      metadata: { source: "events_recommend", inserted: insertedCount },
    });

    return NextResponse.json({
      success: true,
      mode,
      count: insertedCount,
      skipped: skippedCount,
      pipeline: {
        pageCount: perPagePipeline.length,
        sitemapSource: sitemapOverride ? "override" : "auto",
        structureSource: analyzeResult ? "analyze_result.page_view_intent" : "component_only_fallback",
        perPage: perPagePipeline,
        step3_conversionStructure: perPagePipeline[0]?.step3 || null,
        step4_uxEvaluation: perPagePipeline[0]?.step4 || null,
        toolType,
        toolEventAlignment: perPagePipeline.map((pageSummary) => ({
          pageId: pageSummary.pageId,
          pageUrl: pageSummary.pageUrl,
          templates: buildToolTemplates(
            toolType,
            { interactions: [], totals: { navigate: 0, open_modal: 0, open_dropdown: 0, open_tab: 0, open_popup: 0, download: 0, form_submit: 0, trigger_ui: 0 } },
            pageSummary.step3,
            buildPageIntentHint(analyzeResult, pageSummary.pageId),
            pageSummary.pageUrl,
            { hasPurchaseCompletionPage, hasCommerceFunnelSignals }
          ),
        })),
        eventCodeSample: eventsToCreate.slice(0, 5).map((e) => ({
          eventName: e.eventName,
          eventCode: e.eventCode,
          parameterCount: e.parameterTemplates?.length || 0,
        })),
        llmEnabled: usageTotal.usedLlm,
        llmPolicy: {
          provider: llmProvider,
          mode: llmMode,
          llmPageLimit,
          maxInputTokensPerPage,
          maxOutputTokensPerPage,
        },
        llmUsage: usageTotal,
        meaningfulStructure: meaningfulStructureByPage,
      },
    });
  } catch (error: unknown) {
    console.error("Recommend Events Error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
