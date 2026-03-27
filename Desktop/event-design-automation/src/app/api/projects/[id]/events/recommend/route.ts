import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

type LlmUsageStats = {
  enabled: boolean;
  usedLlm: boolean;
  model: string | null;
  approxInputTokens: number;
  approxOutputTokens: number;
  compressedInfoBlocks: number;
  compressedInteractions: number;
};

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function computeInteractionTotals(interactions: InteractionItem[]) {
  return {
    navigate: interactions.filter((i) => i.actionType === "navigate").length,
    open_modal: interactions.filter((i) => i.actionType === "open_modal").length,
    open_dropdown: interactions.filter((i) => i.actionType === "open_dropdown").length,
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

const EVENT_NAME_MAX = 32;

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
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
  const isFilter = hasKeyword(label, ["filter", "facet", "필터"]);
  const isOption = hasKeyword(label, ["option", "select", "dropdown", "checkbox", "라디오", "옵션", "선택"]);
  const isPopup = hasKeyword(label, ["popup", "banner", "promo", "promotion", "팝업", "배너", "프로모션"]);
  const isDismiss = hasKeyword(label, ["close", "dismiss", "skip", "닫기", "건너뛰기"]);
  const isLead = hasKeyword(label, ["contact", "lead", "request", "demo", "문의", "상담", "도입", "신청"]);

  switch (interaction.actionType) {
    case "download":
      return "file_download";
    case "form_submit":
      return isLead ? "generate_lead" : "submit_form";
    case "navigate":
      return isCtaLabel(label) ? "click_cta" : "select_content";
    case "open_dropdown":
      return isFilter ? "toggle_filter" : "select_option";
    case "open_modal":
      return isCtaLabel(label) ? "click_cta" : "select_content";
    case "open_popup":
      if (isDismiss) return "dismiss_promotion";
      return isPopup ? "select_promotion" : "view_promotion";
    default:
      if (isFilter) return "toggle_filter";
      if (isOption) return "select_option";
      return isCtaLabel(label) ? "click_cta" : "select_content";
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

  const deduped = new Map<string, EventParamTemplate>();
  templates.forEach((template) => {
    if (!deduped.has(template.propertyName)) {
      deduped.set(template.propertyName, template);
    }
  });

  return Array.from(deduped.values());
}

function enrichDraftsWithCodesAndTemplates(
  drafts: EventDraft[],
  pagePath: string,
  startIndex = 0
): EventDraft[] {
  return drafts.map((draft, index) => {
    const eventCode = buildEventCode(startIndex + index);
    return {
      ...draft,
      eventCode,
      parameterTemplates: buildParameterTemplates({ ...draft, eventCode }, pagePath),
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
  step2: Step2InteractionStructure
): Step3ConversionStructure {
  const scenario: string[] = [
    `유입: ${step1.urlPath}`,
    "정보구조 스캔: 상단 가치 제안/핵심 섹션 파악",
  ];

  if (step2.totals.open_modal > 0 || step2.totals.open_dropdown > 0) {
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

  const weakPoints: string[] = [];
  if (step2.totals.form_submit === 0) weakPoints.push("명시적인 제출형 전환 지점(form_submit)이 없음");
  if (step2.totals.navigate > 20) weakPoints.push("네비게이션 대상이 많아 전환 동선이 분산될 가능성");
  if (step1.infoBlocks.length < 2) weakPoints.push("정보 덩어리 구분이 적어 단계형 설득 구조가 약할 수 있음");

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

async function buildStep3And4WithLLM(
  analysisGoal: string,
  step1: Step1InformationArchitecture,
  step2: Step2InteractionStructure,
  fallbackStep3: Step3ConversionStructure,
  fallbackStep4: Step4UxEvaluation
): Promise<{ step3: Step3ConversionStructure; step4: Step4UxEvaluation; usage: LlmUsageStats }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const compressedStep1 = compressStep1ForLlm(step1);
  const compressedStep2 = compressStep2ForLlm(step2);

  if (!apiKey) {
    return {
      step3: fallbackStep3,
      step4: fallbackStep4,
      usage: {
        enabled: false,
        usedLlm: false,
        model: null,
        approxInputTokens: 0,
        approxOutputTokens: 0,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
      },
    };
  }

  const promptPayload = {
    analysisGoal,
    step1: compressedStep1,
    step2: compressedStep2,
    instruction: {
      step3: "비즈니스 목표 기준 전환구조를 시나리오 형태로 설계",
      step4: "CTA 집중/네비게이션 분산/첫화면 가치제안을 근거 기반으로 평가",
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
  };

  const promptText = JSON.stringify(promptPayload);
  const approxInputTokens = estimateTokensFromText(promptText);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a UX analytics strategist. Return strict JSON only. No markdown. No explanation.",
          },
          {
            role: "user",
            content: JSON.stringify(promptPayload),
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        step3: fallbackStep3,
        step4: fallbackStep4,
        usage: {
          enabled: true,
          usedLlm: false,
          model,
          approxInputTokens,
          approxOutputTokens: 0,
          compressedInfoBlocks: compressedStep1.infoBlocks.length,
          compressedInteractions: compressedStep2.interactions.length,
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
    };

    const outputText =
      data.output_text ||
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
          approxInputTokens,
          approxOutputTokens,
          compressedInfoBlocks: compressedStep1.infoBlocks.length,
          compressedInteractions: compressedStep2.interactions.length,
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
        approxInputTokens,
        approxOutputTokens,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
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
        approxInputTokens,
        approxOutputTokens: 0,
        compressedInfoBlocks: compressedStep1.infoBlocks.length,
        compressedInteractions: compressedStep2.interactions.length,
      },
    };
  }
}

function buildToolTemplates(
  toolType: string,
  step2: Step2InteractionStructure,
  step3: Step3ConversionStructure
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

  if (/(가입|회원가입|sign.?up|register)/.test(allText)) {
    templates.push({ eventName: "sign_up", reason: "가입 전환 지점 존재" });
  }
  if (/(로그인|login|sign.?in)/.test(allText)) {
    templates.push({ eventName: "login", reason: "로그인 전환 지점 존재" });
  }
  if (/(구매|결제|checkout|buy|order)/.test(allText)) {
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
  toolType: string,
  step2: Step2InteractionStructure,
  step4: Step4UxEvaluation,
  ga4Templates: Ga4Template[]
): EventDraft[] {
  const drafts: EventDraft[] = [];
  const normalizedToolType = toolType === "amplitude" ? "amplitude" : "ga4";

  drafts.push({
    projectId,
    pageId,
    eventName: normalizedToolType === "amplitude" ? "session_start" : "page_view",
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
        eventName: template.eventName.slice(0, EVENT_NAME_MAX),
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
    const eventName = inferSemanticEventName(interaction).slice(0, EVENT_NAME_MAX);
    const existing =
      groupedBySemanticName.get(eventName) ||
      { eventName, labels: [], destinations: [], actionTypes: [], count: 0 };

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

    groupedBySemanticName.set(eventName, existing);
  });

  const isHighPriorityName = (name: string) =>
    ["generate_lead", "purchase", "begin_checkout", "sign_up", "login", "submit_form", "click_cta"].includes(name);

  const buildContextParams = (
    eventName: string,
    labels: string[],
    destinations: string[],
    count: number
  ): EventParamTemplate[] => {
    const firstLabel = labels[0] || "cta_button";
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
      priority: isHighPriorityName(group.eventName) ? "HIGH" : "MEDIUM",
      status: "draft",
      sourceType: "custom_ai",
      contextParams: buildContextParams(group.eventName, group.labels, group.destinations, group.count),
    });
  });

  drafts.push({
    projectId,
    pageId,
    eventName: "ux_cta_concentration_checked",
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
    eventName: "ux_navigation_dispersion_checked",
    description: `[UX평가] ${step4.navigationDispersion}`,
    triggerType: "derived",
    triggerCondition: "Evaluate navigation dispersion status",
    priority: "LOW",
    status: "draft",
    sourceType: "custom_ai",
  });

  const deduped = new Map<string, EventDraft>();
  drafts.forEach((draft) => {
    const eventName = draft.eventName.slice(0, EVENT_NAME_MAX);
    if (!deduped.has(eventName)) {
      deduped.set(eventName, { ...draft, eventName });
    }
  });

  return Array.from(deduped.values());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => ({} as { mode?: string }));
    const mode = body?.mode === "supplement" ? "supplement" : "replace";

    const params = await context.params;
    const { id } = params;

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

    const toolType = project.toolType || "ga4";
    const sitemapOverride = parseJson<SitemapOverride | null>(project.sitemapOverrideJson, null);
    const overrideEdgesByFromPage = new Map<string, string[]>();
    if (sitemapOverride?.edges?.length) {
      sitemapOverride.edges.forEach((edge) => {
        const list = overrideEdgesByFromPage.get(edge.fromPageId) || [];
        list.push(edge.toPageId);
        overrideEdgesByFromPage.set(edge.fromPageId, list);
      });
    }
    const pagesForDesign = [...project.pages].sort((a, b) => (a.pageType === "main" ? -1 : 1) - (b.pageType === "main" ? -1 : 1));
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
    }> = [];

    const usageTotal: LlmUsageStats = {
      enabled: Boolean(process.env.OPENAI_API_KEY),
      usedLlm: false,
      model: null,
      approxInputTokens: 0,
      approxOutputTokens: 0,
      compressedInfoBlocks: 0,
      compressedInteractions: 0,
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
          if (!targetPage) return;
          syntheticNavigateInteractions.push({
            label: `sitemap_to_${slugify(targetPage.title || "page", `p${edgeIndex + 1}`)}`,
            actionType: "navigate",
            destination: targetPage.url,
            confidence: "high" as const,
          });
        });
      const mergedInteractions = [...baseStep2.interactions, ...syntheticNavigateInteractions];
      const step2: Step2InteractionStructure = {
        interactions: mergedInteractions,
        totals: computeInteractionTotals(mergedInteractions),
      };
      const fallbackStep3 = buildStep3ConversionStructure(project.analysisGoal, step1, step2);
      const fallbackStep4 = buildStep4UxEvaluation(step1, step2, fallbackStep3);

      const llmResult =
        index === 0
          ? await buildStep3And4WithLLM(project.analysisGoal, step1, step2, fallbackStep3, fallbackStep4)
          : {
              step3: fallbackStep3,
              step4: fallbackStep4,
              usage: {
                enabled: Boolean(process.env.OPENAI_API_KEY),
                usedLlm: false,
                model: null,
                approxInputTokens: 0,
                approxOutputTokens: 0,
                compressedInfoBlocks: 0,
                compressedInteractions: 0,
              } as LlmUsageStats,
            };
      const { step3, step4, usage } = llmResult;

      usageTotal.usedLlm = usageTotal.usedLlm || usage.usedLlm;
      usageTotal.model = usageTotal.model || usage.model;
      usageTotal.approxInputTokens += usage.approxInputTokens;
      usageTotal.approxOutputTokens += usage.approxOutputTokens;
      usageTotal.compressedInfoBlocks += usage.compressedInfoBlocks;
      usageTotal.compressedInteractions += usage.compressedInteractions;

      const ga4Templates = buildToolTemplates(toolType, step2, step3);
      const draftedEvents = designEvents(project.id, page.id, page.title || "main", toolType, step2, step4, ga4Templates);
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
      });
    }

    console.info("[LLM_USAGE]", usageTotal);

    if (eventsToCreate.length === 0) {
      return NextResponse.json({ error: "No components found to design events" }, { status: 400 });
    }

    if (mode === "replace") {
      await prisma.event.deleteMany({
        where: { projectId: project.id, sourceType: { in: ["ai", "ga4_recommended", "custom_ai"] } },
      });
    }

    const existingEvents = await prisma.event.findMany({
      where: { projectId: project.id },
      select: { eventName: true, pageId: true },
    });
    const existingNameSet = new Set(existingEvents.map((e) => `${e.pageId || "none"}::${e.eventName}`));

    const eventsToInsert =
      mode === "replace"
        ? eventsToCreate
        : eventsToCreate.filter((eventDraft) => !existingNameSet.has(`${eventDraft.pageId}::${eventDraft.eventName}`));

    if (eventsToInsert.length > 0) {
      await prisma.$transaction(
        eventsToInsert.map((eventDraft) =>
          prisma.event.create({
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
          })
        )
      );
    }

    return NextResponse.json({
      success: true,
      mode,
      count: eventsToInsert.length,
      skipped: eventsToCreate.length - eventsToInsert.length,
      pipeline: {
        pageCount: perPagePipeline.length,
        sitemapSource: sitemapOverride ? "override" : "auto",
        perPage: perPagePipeline,
        step3_conversionStructure: perPagePipeline[0]?.step3 || null,
        step4_uxEvaluation: perPagePipeline[0]?.step4 || null,
        toolType,
        toolEventAlignment: perPagePipeline.map((pageSummary) => ({
          pageId: pageSummary.pageId,
          pageUrl: pageSummary.pageUrl,
          templates: buildToolTemplates(
            toolType,
            { interactions: [], totals: { navigate: 0, open_modal: 0, open_dropdown: 0, open_popup: 0, download: 0, form_submit: 0, trigger_ui: 0 } },
            pageSummary.step3
          ),
        })),
        eventCodeSample: eventsToCreate.slice(0, 5).map((e) => ({
          eventName: e.eventName,
          eventCode: e.eventCode,
          parameterCount: e.parameterTemplates?.length || 0,
        })),
        llmEnabled: usageTotal.usedLlm,
        llmUsage: usageTotal,
      },
    });
  } catch (error: unknown) {
    console.error("Recommend Events Error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
