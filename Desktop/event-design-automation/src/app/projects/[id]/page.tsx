"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type JsonRecord = Record<string, unknown>;

type SitemapNode = {
  id: string;
  url: string;
  title: string;
};

type SitemapEdge = {
  fromPageId: string;
  toPageId: string;
};

type ProjectComponent = {
  id: string;
  componentType: string;
  label: string | null;
  selector: string | null;
  metadataJson: string | null;
};

type ProjectPageData = {
  id: string;
  url: string;
  title: string | null;
  components: ProjectComponent[];
};

type ProjectEventData = {
  id: string;
  pageId: string | null;
  eventName: string;
  status?: string | null;
};

type PageClassification = {
  pageId: string;
  pageType?: string | null;
  pageGoal?: string | null;
  primaryCta?: string | null;
  secondaryCta?: string | null;
};

type SectionInfo = {
  order?: number;
  sectionType?: string;
  sectionLabel?: string;
  sectionGoal?: string;
};

type SectionCollection = {
  pageId: string;
  sections?: SectionInfo[];
};

type MenuTreeNode = {
  id: string;
  title: string;
  url: string | null;
  pageType: string;
  virtual?: boolean;
  children: MenuTreeNode[];
};

type MenuSection = {
  sectionType: string;
  title: string;
  nodeCount?: number;
  trees: MenuTreeNode[];
};

type CoreUserFlow = {
  flowId: string;
  flowType: string;
  pages?: Array<{ pageType?: string | null }>;
};

type LlmUsage = {
  model?: string | null;
  provider?: string | null;
  llmMode?: string | null;
  approxInputTokens?: number;
  approxOutputTokens?: number;
  maxInputTokensPerPage?: number;
  maxOutputTokensPerPage?: number;
  usedLlm?: boolean;
  inputCapped?: boolean;
};

type AnalyzeSnapshot = {
  ai_interpretation?: {
    llmUsage?: LlmUsage | null;
    updatedAt?: string | null;
  } | null;
  page_classification?: PageClassification[];
  section_structure?: SectionCollection[];
  page_section_map?: SectionCollection[];
  menu_structure?: {
    trees?: MenuTreeNode[];
    sections?: MenuSection[];
  } | null;
  core_user_flows?: CoreUserFlow[];
};

type ProjectDetailData = {
  id: string;
  name: string;
  targetUrl: string;
  analysisGoal: string;
  pages: ProjectPageData[];
  events: ProjectEventData[];
  analyzeSnapshot?: AnalyzeSnapshot | null;
  _count?: {
    events?: number;
    pages?: number;
  };
};

type MappedMenuPage = {
  id: string;
  title: string;
  url: string;
  sections: SectionInfo[];
};

type AdvancedStructureRow = {
  id: string;
  label: string | null;
  sectionType: string;
  repeatCount: number;
  clickableCount: number;
  keyActions: string[];
  selector: string;
  domPath: string;
  ocrLabel: string;
};

type AdvancedClickableRow = {
  id: string;
  label: string | null;
  actionType: string;
  selector: string;
  domPath: string;
  ocrLabel: string;
};

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function toStringValue(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<number>(0);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(null);
  const [analyzeElapsedSec, setAnalyzeElapsedSec] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [sitemapState, setSitemapState] = useState<{
    source: "auto" | "override";
    nodes: Array<{ id: string; url: string; title: string }>;
    edges: Array<{ fromPageId: string; toPageId: string }>;
  } | null>(null);
  const [editingSitemap, setEditingSitemap] = useState(false);
  const [sitemapSaving, setSitemapSaving] = useState(false);
  const [sitemapMessage, setSitemapMessage] = useState<string | null>(null);
  const [edgeForm, setEdgeForm] = useState({ fromPageId: "", toPageId: "" });
  const [newNodeForm, setNewNodeForm] = useState({ title: "", url: "" });
  const [selectedSitemapNodeId, setSelectedSitemapNodeId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualPathInput, setManualPathInput] = useState("");
  const [showAdvancedStructure, setShowAdvancedStructure] = useState(false);

  const parseJson = <T,>(value: string | null | undefined, fallback: T): T => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    if (!analyzing || !analyzeStartedAt) return;
    const timer = setInterval(() => {
      setAnalyzeElapsedSec(Math.max(0, Math.floor((Date.now() - analyzeStartedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [analyzing, analyzeStartedAt]);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = (await res.json()) as ProjectDetailData;
        setProject(data);
        setSelectedPageId((prev) => prev || data?.pages?.[0]?.id || null);
        setSelectedSitemapNodeId((prev) => prev || data?.pages?.[0]?.id || null);
        const sitemapRes = await fetch(`/api/projects/${id}/sitemap`);
        if (sitemapRes.ok) {
          const sitemapData = await sitemapRes.json();
          const nodes: SitemapNode[] = Array.isArray(sitemapData?.sitemap?.nodes) ? sitemapData.sitemap.nodes : [];
          const edges: SitemapEdge[] = Array.isArray(sitemapData?.sitemap?.edges) ? sitemapData.sitemap.edges : [];
          setSitemapState({
            source: sitemapData?.source === "override" ? "override" : "auto",
            nodes,
            edges,
          });
          setSelectedSitemapNodeId((prev) => prev || nodes[0]?.id || null);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const startAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeStatus("queued");
    setAnalyzeProgress(0);
    setAnalyzeStartedAt(Date.now());
    setAnalyzeElapsedSec(0);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "분석 실패");
        setAnalyzeStatus("failed");
        return;
      }

      const data = await res.json();
      const jobId = data?.job_id;
      if (!jobId) {
        setAnalyzeStatus("failed");
        alert("분석 Job 생성 실패");
        return;
      }

      let done = false;
      for (let i = 0; i < 180; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/api/projects/${id}/analyze/${jobId}`);
        if (!statusRes.ok) {
          const errData = await statusRes.json().catch(() => ({}));
          if (errData.error) {
            setAnalyzeStatus("failed");
            alert(errData.error);
            done = true;
            break;
          }
          continue;
        }
        const statusData = await statusRes.json();
        setAnalyzeStatus(statusData.status || "running");
        setAnalyzeProgress(typeof statusData.progress === "number" ? statusData.progress : 0);

        if (statusData.status === "completed") {
          done = true;
          await fetchProject();
          break;
        }

        if (statusData.status === "failed") {
          done = true;
          alert(statusData.error || "분석 실패");
          break;
        }
      }

      if (!done) {
        setAnalyzeStatus("failed");
        alert("분석이 시간 초과되었습니다. 다시 시도해주세요.");
      }
    } catch (err) {
      console.error(err);
      alert("오류 발생");
      setAnalyzeStatus("failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const startEventGeneration = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${id}/events/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmMode: "budget",
          llmPageLimit: 1,
          maxInputTokensPerPage: 1200,
          maxOutputTokensPerPage: 500,
        }),
      });
      if (res.ok) {
        router.push(`/projects/${id}/events`);
      } else {
        alert("이벤트 생성 실패");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const selectedPage =
    project?.pages?.find((page) => page.id === selectedPageId) ??
    (selectedSitemapNodeId
      ? (project?.pages?.find((page) => page.id === selectedSitemapNodeId) ?? null)
      : (project?.pages?.[0] ?? null));
  const selectedComponent =
    selectedPage?.components?.find((comp) => comp.id === selectedComponentId) || null;

  const eventCountByPage = new Map<string, number>();
  (project?.events || []).forEach((event) => {
    const key = event.pageId || "none";
    eventCountByPage.set(key, (eventCountByPage.get(key) || 0) + 1);
  });

  const sitemapEdges = sitemapState?.edges || [];

  const addSitemapEdge = () => {
    if (!edgeForm.fromPageId || !edgeForm.toPageId || edgeForm.fromPageId === edgeForm.toPageId) return;
    setSitemapMessage(null);
    setSitemapState((prev) => {
      if (!prev) return prev;
      const key = `${edgeForm.fromPageId}->${edgeForm.toPageId}`;
      const exists = prev.edges.some((edge) => `${edge.fromPageId}->${edge.toPageId}` === key);
      if (exists) return prev;
      return {
        ...prev,
        edges: [...prev.edges, { fromPageId: edgeForm.fromPageId, toPageId: edgeForm.toPageId }],
      };
    });
  };

  const removeSitemapEdge = (fromPageId: string, toPageId: string) => {
    setSitemapMessage(null);
    setSitemapState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        edges: prev.edges.filter((edge) => !(edge.fromPageId === fromPageId && edge.toPageId === toPageId)),
      };
    });
  };

  const addSitemapNode = () => {
    const title = newNodeForm.title.trim();
    const url = newNodeForm.url.trim();
    if (!title || !url) return;
    try {
      new URL(url);
    } catch {
      setSitemapMessage("URL 형식이 올바르지 않습니다.");
      return;
    }

    setSitemapMessage(null);
    const nodeId = `custom_${Date.now()}`;
    setSitemapState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: [...prev.nodes, { id: nodeId, title, url }],
      };
    });
    setSelectedSitemapNodeId(nodeId);
    setNewNodeForm({ title: "", url: "" });
  };

  const removeSitemapNode = (nodeId: string) => {
    setSitemapState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.filter((node) => node.id !== nodeId),
        edges: prev.edges.filter((edge) => edge.fromPageId !== nodeId && edge.toPageId !== nodeId),
      };
    });
    if (selectedSitemapNodeId === nodeId) setSelectedSitemapNodeId(null);
  };

  const applyManualPathCapture = () => {
    const lines = manualPathInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setSitemapMessage("수동 경로 URL을 1개 이상 입력해주세요.");
      return;
    }

    const normalize = (url: string) => {
      try {
        const parsed = new URL(url);
        parsed.hash = "";
        if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
          parsed.pathname = parsed.pathname.slice(0, -1);
        }
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const validUrls = lines.map(normalize).filter((url): url is string => Boolean(url));
    if (validUrls.length === 0) {
      setSitemapMessage("유효한 URL이 없습니다. https:// 형태로 입력해주세요.");
      return;
    }

    setSitemapState((prev) => {
      if (!prev) return prev;

      const nodes = [...prev.nodes];
      const nodeByUrl = new Map(nodes.map((node) => [node.url, node]));

      const nodeIdsInOrder: string[] = [];
      validUrls.forEach((url, idx) => {
        let node = nodeByUrl.get(url);
        if (!node) {
          const titleFromPath = (() => {
            try {
              const parsed = new URL(url);
              const path = parsed.pathname.replace(/^\/+/, "") || "home";
              return decodeURIComponent(path).slice(0, 40);
            } catch {
              return `manual_${idx + 1}`;
            }
          })();
          node = {
            id: `custom_manual_${Date.now()}_${idx + 1}`,
            url,
            title: titleFromPath,
          };
          nodes.push(node);
          nodeByUrl.set(url, node);
        }
        nodeIdsInOrder.push(node.id);
      });

      const edgeSet = new Set(prev.edges.map((edge) => `${edge.fromPageId}->${edge.toPageId}`));
      const mergedEdges = [...prev.edges];
      for (let i = 0; i < nodeIdsInOrder.length - 1; i += 1) {
        const from = nodeIdsInOrder[i];
        const to = nodeIdsInOrder[i + 1];
        if (!from || !to || from === to) continue;
        const key = `${from}->${to}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          mergedEdges.push({ fromPageId: from, toPageId: to });
        }
      }

      return {
        ...prev,
        source: "override",
        nodes,
        edges: mergedEdges,
      };
    });

    setSelectedSitemapNodeId((prev) => prev || null);
    setSitemapMessage(`수동 경로 반영 완료: URL ${validUrls.length}개`);
  };

  const appendManualUrls = (urls: string[]) => {
    const existing = manualPathInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...existing, ...urls.filter(Boolean)]));
    setManualPathInput(merged.join("\n"));
  };

  const fillManualUrlsFromKnownNodes = () => {
    const known = sitemapNodes.map((node) => node.url).filter(Boolean);
    appendManualUrls(known);
    setSitemapMessage(`기존 노드 URL ${known.length}개를 수동 입력창에 채웠습니다.`);
  };

  const addSelectedNodeUrlToManual = () => {
    if (!selectedSitemapNode?.url) {
      setSitemapMessage("선택된 노드 URL이 없습니다.");
      return;
    }
    appendManualUrls([selectedSitemapNode.url]);
    setSitemapMessage("선택 노드 URL을 추가했습니다.");
  };

  const addTargetUrlToManual = () => {
    if (!project?.targetUrl) return;
    appendManualUrls([project.targetUrl]);
    setSitemapMessage("프로젝트 타겟 URL을 추가했습니다.");
  };

  const saveSitemapOverride = async () => {
    if (!sitemapState) return;
    setSitemapSaving(true);
    setSitemapMessage(null);
    try {
      const res = await fetch(`/api/projects/${id}/sitemap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: sitemapState.nodes, edges: sitemapState.edges }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSitemapMessage(data.error || "사이트맵 저장 실패");
        return;
      }
      setSitemapState((prev) => (prev ? { ...prev, source: "override" } : prev));
      setEditingSitemap(false);
      setSitemapMessage("사이트맵 수정본을 저장했습니다.");
    } catch (error) {
      console.error(error);
      setSitemapMessage("사이트맵 저장 중 오류가 발생했습니다.");
    } finally {
      setSitemapSaving(false);
    }
  };

  const resetSitemapOverride = async () => {
    setSitemapSaving(true);
    setSitemapMessage(null);
    try {
      const res = await fetch(`/api/projects/${id}/sitemap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSitemapMessage(data.error || "자동 사이트맵 복원 실패");
        return;
      }
      const reloadRes = await fetch(`/api/projects/${id}/sitemap`);
      if (reloadRes.ok) {
        const data = await reloadRes.json();
        setSitemapState({
          source: data?.source === "override" ? "override" : "auto",
          nodes: Array.isArray(data?.sitemap?.nodes) ? data.sitemap.nodes : [],
          edges: Array.isArray(data?.sitemap?.edges) ? data.sitemap.edges : [],
        });
      }
      setEditingSitemap(false);
      setSitemapMessage("자동 사이트맵으로 복원했습니다.");
    } catch (error) {
      console.error(error);
      setSitemapMessage("사이트맵 복원 중 오류가 발생했습니다.");
    } finally {
      setSitemapSaving(false);
    }
  };

  const uniqueSitemapEdges = Array.from(
    new Map(
      sitemapEdges.map((edge) => [`${edge.fromPageId}->${edge.toPageId}`, edge])
    ).values()
  );

  const sitemapNodes: SitemapNode[] = sitemapState?.nodes?.length
    ? sitemapState.nodes
    : (project?.pages || []).map((page) => ({ id: page.id, url: page.url, title: page.title || "Untitled" }));

  const selectedSitemapNode =
    sitemapNodes.find((node: { id: string }) => node.id === selectedSitemapNodeId) || sitemapNodes[0] || null;

  const nodeById = new Map(sitemapNodes.map((node) => [node.id, node]));
  const indegree = new Map<string, number>();
  const outByFrom = new Map<string, string[]>();
  sitemapNodes.forEach((node) => indegree.set(node.id, 0));
  uniqueSitemapEdges.forEach((edge) => {
    indegree.set(edge.toPageId, (indegree.get(edge.toPageId) || 0) + 1);
    const list = outByFrom.get(edge.fromPageId) || [];
    list.push(edge.toPageId);
    outByFrom.set(edge.fromPageId, list);
  });

  const roots = sitemapNodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .map((node) => node.id);

  const getAnalyzeButtonLabel = () => {
    const prefix = "구조 분석";
    if (!analyzing) return `${prefix} 실행`;
    if (analyzeStatus === "queued") return `${prefix} 대기 중...`;
    if (analyzeStatus === "running") return `${prefix} 중... ${analyzeProgress}%`;
    if (analyzeStatus === "completed") return `${prefix} 완료`;
    if (analyzeStatus === "failed") return `${prefix} 실패`;
    return "분석 중...";
  };

  const getAnalyzeStageLabel = () => {
    if (analyzeStatus === "queued") return "작업 큐 대기";
    if (analyzeStatus === "failed") return "실패";
    if (analyzeStatus === "completed") return "완료";
    if (!analyzing && !analyzeStatus) return "대기";
    if (analyzeProgress <= 15) return "초기화";
    if (analyzeProgress <= 45) return "페이지 크롤링";
    if (analyzeProgress <= 60) return "구조 추출";
    if (analyzeProgress <= 85) return "의도/UX 분석";
    return "결과 저장";
  };

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (loading) return <div className="container" style={{padding: '2rem'}}>Loading...</div>;
  if (!project) return <div className="container" style={{padding: '2rem'}}>Project not found.</div>;

  const previewUrl = selectedSitemapNode?.url || selectedPage?.url || project.targetUrl;
  const selectedPageEvents = selectedPage
    ? (project?.events || []).filter((event) => event.pageId === selectedPage.id)
    : [];
  const analyzeSnapshot: AnalyzeSnapshot = project?.analyzeSnapshot || {};
  const aiInterpretation = analyzeSnapshot?.ai_interpretation || null;
  const llmUsage = aiInterpretation?.llmUsage || null;
  const pageClassificationList = Array.isArray(analyzeSnapshot?.page_classification)
    ? analyzeSnapshot.page_classification
    : [];
  const sectionStructureList = Array.isArray(analyzeSnapshot?.section_structure)
    ? analyzeSnapshot.section_structure
    : [];
  const pageSectionMapList = Array.isArray(analyzeSnapshot?.page_section_map)
    ? analyzeSnapshot.page_section_map
    : [];
  const parsedMenuTrees = Array.isArray(analyzeSnapshot?.menu_structure?.trees)
    ? analyzeSnapshot.menu_structure.trees
    : [];
  const parsedMenuSections = Array.isArray(analyzeSnapshot?.menu_structure?.sections)
    ? analyzeSnapshot.menu_structure.sections
    : [];
  const coreUserFlows = Array.isArray(analyzeSnapshot?.core_user_flows)
    ? analyzeSnapshot.core_user_flows
    : [];
  const selectedPageClassification =
    pageClassificationList.find((item) => item.pageId === selectedPage?.id) || null;
  const selectedPageSectionStructure =
    sectionStructureList.find((item) => item.pageId === selectedPage?.id) || null;
  const selectedPageSectionMap =
    pageSectionMapList.find((item) => item.pageId === selectedPage?.id) || null;
  const keySections = (selectedPageSectionStructure?.sections || []).slice(0, 7);
  const orderedSections = (selectedPageSectionMap?.sections || []).slice(0, 8);
  const pageTypeById = new Map(pageClassificationList.map((item) => [item.pageId, item.pageType || "other"]));
  const treeChildrenByParent = new Map<string, string[]>();
  const parentByChild = new Map<string, string>();
  uniqueSitemapEdges.forEach((edge) => {
    const list = treeChildrenByParent.get(edge.fromPageId) || [];
    list.push(edge.toPageId);
    treeChildrenByParent.set(edge.fromPageId, Array.from(new Set(list)));
    if (!parentByChild.has(edge.toPageId)) parentByChild.set(edge.toPageId, edge.fromPageId);
  });

  const homeNode =
    sitemapNodes.find((node) => {
      try {
        return new URL(node.url).pathname === "/";
      } catch {
        return false;
      }
    }) || null;
  const typedMainNode = sitemapNodes.find((node) => pageTypeById.get(node.id) === "main") || null;
  const menuRootId = homeNode?.id || typedMainNode?.id || roots[0] || sitemapNodes[0]?.id || null;

  const pathnameById = new Map<string, string>();
  sitemapNodes.forEach((node) => {
    try {
      pathnameById.set(node.id, new URL(node.url).pathname || "/");
    } catch {
      pathnameById.set(node.id, "/");
    }
  });

  // 메뉴 트리 보강: 엣지가 약해도 URL 경로 기준으로 부모를 추정한다.
  sitemapNodes.forEach((node) => {
    if (!menuRootId || node.id === menuRootId) return;
    if (parentByChild.has(node.id)) return;
    const nodePath = pathnameById.get(node.id) || "/";
    let bestParentId: string | null = null;
    let bestLen = -1;
    sitemapNodes.forEach((candidate) => {
      if (candidate.id === node.id) return;
      const candidatePath = pathnameById.get(candidate.id) || "/";
      if (candidatePath === "/" && bestParentId) return;
      if (nodePath === candidatePath) return;
      const isParentPath =
        candidatePath === "/" ? nodePath !== "/" : nodePath.startsWith(`${candidatePath}/`);
      if (!isParentPath) return;
      if (candidatePath.length > bestLen) {
        bestLen = candidatePath.length;
        bestParentId = candidate.id;
      }
    });
    const parentId = bestParentId || menuRootId;
    const list = treeChildrenByParent.get(parentId) || [];
    list.push(node.id);
    treeChildrenByParent.set(parentId, Array.from(new Set(list)));
    parentByChild.set(node.id, parentId);
  });

  const buildMenuTree = (nodeId: string, depth = 0, seen = new Set<string>()): MenuTreeNode | null => {
    if (depth > 12 || seen.has(nodeId)) return null;
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(nodeId);
    const childIds = (treeChildrenByParent.get(nodeId) || []).filter((id) => !nextSeen.has(id));
    childIds.sort((a, b) => {
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      return String(aNode?.title || "").localeCompare(String(bNode?.title || ""));
    });
    return {
      id: node.id,
      title: node.title || "Untitled",
      url: node.url,
      pageType: pageTypeById.get(node.id) || "other",
      children: childIds
        .map((childId) => buildMenuTree(childId, depth + 1, nextSeen))
        .filter((child): child is MenuTreeNode => Boolean(child)),
    };
  };

  const menuRootIds = menuRootId
    ? [menuRootId]
    : sitemapNodes.filter((node) => !parentByChild.has(node.id)).map((node) => node.id);

  const getPathname = (url: string | null | undefined) => {
    if (!url) return "/";
    try {
      return new URL(url).pathname || "/";
    } catch {
      return "/";
    }
  };

  const getFirstSegment = (url: string | null | undefined) => {
    const path = getPathname(url);
    const seg = path.split("/").filter(Boolean)[0] || "";
    return seg.toLowerCase();
  };

  const toSegmentLabel = (segment: string) => decodeURIComponent(segment).replace(/[-_]+/g, " ");

  const addTopLevelGroups = (tree: MenuTreeNode) => {
    if (!tree || !Array.isArray(tree.children) || tree.children.length <= 2) return tree;
    const treeOrigin = (() => {
      if (!tree.url) return "";
      try {
        return new URL(tree.url).origin;
      } catch {
        return "";
      }
    })();
    const grouped = new Map<string, MenuTreeNode[]>();
    const passthrough: MenuTreeNode[] = [];

    tree.children.forEach((child) => {
      const seg = getFirstSegment(child.url || "");
      if (!seg) {
        passthrough.push(child);
        return;
      }
      const list = grouped.get(seg) || [];
      list.push(child);
      grouped.set(seg, list);
    });

    const merged: MenuTreeNode[] = [...passthrough];
    grouped.forEach((children, segment) => {
      if (children.length < 2) {
        merged.push(...children);
        return;
      }
      merged.push({
        id: `virtual:${tree.id}:${segment}`,
        title: toSegmentLabel(segment),
        url: `${treeOrigin}${getPathname(tree.url).replace(/\/$/, "")}/${segment}`,
        pageType: "group",
        virtual: true,
        children,
      });
    });

    merged.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return { ...tree, children: merged };
  };

  const menuTreesFallback = menuRootIds
    .map((rootId) => buildMenuTree(rootId))
    .filter((tree): tree is MenuTreeNode => Boolean(tree))
    .map((tree) => addTopLevelGroups(tree));
  const menuTrees = parsedMenuTrees.length > 0 ? parsedMenuTrees : menuTreesFallback;
  const menuSectionsForView =
    parsedMenuSections.length > 0
      ? parsedMenuSections
      : [{ sectionType: "menu_other", title: "Menu Structure", nodeCount: menuTrees.length, trees: menuTrees }];

  const analysisGoalText = String(project?.analysisGoal || "").toLowerCase();
  const focusedPageTypes = (() => {
    if (/(회원|가입|signup|register|onboard)/i.test(analysisGoalText)) {
      return new Set(["main", "login", "sign_up", "form", "complete"]);
    }
    if (/(구매|결제|매출|purchase|checkout|order|cart)/i.test(analysisGoalText)) {
      return new Set(["main", "plp", "pdp", "cart", "checkout", "purchase"]);
    }
    if (/(리드|문의|상담|lead|contact|inquiry)/i.test(analysisGoalText)) {
      return new Set(["main", "detail", "pdp", "form", "complete"]);
    }
    return new Set(["main", "plp", "pdp", "detail", "form"]);
  })();

  const toMenuLabel = (node: { title: string; url: string | null; pageType: string }) => {
    const title = String(node.title || "").trim();
    if (title && title.toLowerCase() !== "untitled") return title;
    try {
      const path = getPathname(node.url);
      if (path === "/") return "home";
      const seg = path.split("/").filter(Boolean).pop() || "page";
      return decodeURIComponent(seg).replace(/[-_]+/g, " ");
    } catch {
      return node.pageType || "page";
    }
  };

  const normalizeMatchUrl = (raw: string | null | undefined) => {
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return String(raw);
    }
  };

  const resolveNodePage = (node: MenuTreeNode | SitemapNode) => {
    const byId = (project.pages || []).find((p) => p.id === node.id);
    if (byId) return byId;
    const nodeUrl = normalizeMatchUrl(node.url);
    return (project.pages || []).find((p) => normalizeMatchUrl(p.url) === nodeUrl) || null;
  };

  const isUtilityNode = (node: MenuTreeNode) => {
    const text = `${node?.title || ""} ${node?.url || ""}`.toLowerCase();
    return /(login|sign.?in|signin|like|wishlist|favorite|order|orders|cart|mypage|my|계정|로그인|좋아요|주문|장바구니|마이)/i.test(text);
  };

  const dedupeNodesByUrl = (nodes: MenuTreeNode[]) => {
    const seen = new Set<string>();
    const out: MenuTreeNode[] = [];
    nodes.forEach((node) => {
      const key = `${normalizeMatchUrl(node?.url)}::${String(node?.title || "").toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(node);
    });
    return out;
  };

  const sectionTitleByType: Record<string, string> = {
    top_nav: "GNB Menu",
    hamburger_menu: "Side Menu",
    search_menu: "Search Menu",
    menu_other: "Other Menu",
  };
  const normalizedSectionRoots = menuSectionsForView
    .map((section) => {
      const deduped = dedupeNodesByUrl(section.trees || []);
      const utility = deduped.filter((node) => isUtilityNode(node));
      const primary = deduped.filter((node) => !isUtilityNode(node));
      return {
        sectionType: String(section.sectionType || "menu_other"),
        title: String(section.title || ""),
        utility,
        primary,
      };
    })
    .filter((section) => section.utility.length > 0 || section.primary.length > 0);

  const hasMultipleSectionGroups = normalizedSectionRoots.length > 1;
  const singleSectionPrimaryRoots = dedupeNodesByUrl(
    normalizedSectionRoots.flatMap((section) => section.primary)
  );
  const allUtilityRoots = dedupeNodesByUrl(normalizedSectionRoots.flatMap((section) => section.utility)).map(
    (node) => ({
      ...node,
      pageType: node.pageType || "utility",
    })
  );

  const sectionGroupNodes = normalizedSectionRoots
    .map((section) => ({
      id: `virtual:menu-section:${section.sectionType}`,
      title: sectionTitleByType[section.sectionType] || section.title || "Menu Group",
      url: null,
      pageType: "group",
      virtual: true,
      children: dedupeNodesByUrl(section.primary),
    }))
    .filter((group) => (group.children || []).length > 0);
  const utilityGroupNode =
    allUtilityRoots.length > 0
      ? {
          id: "virtual:menu-section:utility",
          title: "Utility",
          url: null,
          pageType: "group",
          virtual: true,
          children: allUtilityRoots,
        }
      : null;

  const mainTree = {
    id: "virtual:main-root",
    title: "main",
    url: project?.targetUrl || "/",
    pageType: "main",
    virtual: true,
    children: hasMultipleSectionGroups
      ? [...sectionGroupNodes, ...(utilityGroupNode ? [utilityGroupNode] : [])]
      : [...singleSectionPrimaryRoots, ...allUtilityRoots],
  };

  const primaryMenuNodes = hasMultipleSectionGroups
    ? sectionGroupNodes.flatMap((group) => group.children || [])
    : singleSectionPrimaryRoots;

  const renderMenuTree = (node: MenuTreeNode, depth = 0, lineage = "root") => {
    const resolvedPage = resolveNodePage(node);
    const isSelected = Boolean(resolvedPage && selectedPage?.id === resolvedPage.id);
    const isFocused = focusedPageTypes.has(node.pageType);
    const isVirtual = String(node.id || "").startsWith("virtual:");
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const nodeKey = `tree-${lineage}-${String(node.id || "node")}-${String(node.url || "")}-${String(node.title || "")}`;
    return (
      <div key={nodeKey} style={{ marginLeft: depth > 0 ? 8 : 0, marginBottom: "0.45rem" }}>
        <button
          type="button"
          onClick={() => {
            if (isVirtual) return;
            if (resolvedPage) {
              setSelectedSitemapNodeId(resolvedPage.id);
              setSelectedPageId(resolvedPage.id);
            }
            setSelectedComponentId(null);
          }}
          style={{
            width: "auto",
            minWidth: depth === 0 ? "240px" : "180px",
            maxWidth: depth === 0 ? "520px" : "280px",
            display: "inline-block",
            textAlign: "left",
            background: isSelected
              ? "rgba(88,166,255,0.2)"
              : isFocused
              ? "rgba(34,197,94,0.16)"
              : "rgba(255,255,255,0.04)",
            border: isSelected ? "1px solid var(--accent-color)" : "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "0.45rem 0.55rem",
            color: isVirtual ? "#d1d5db" : "#fff",
            cursor: isVirtual ? "default" : "pointer",
          }}
        >
          <div style={{ fontSize: "0.84rem", fontWeight: 600 }}>
            {toMenuLabel(node)}
            {isFocused && (
              <span
                style={{
                  marginLeft: "0.4rem",
                  fontSize: "0.67rem",
                  color: "#86efac",
                  border: "1px solid rgba(134,239,172,0.45)",
                  borderRadius: "999px",
                  padding: "0.05rem 0.32rem",
                  verticalAlign: "middle",
                }}
              >
                focus
              </span>
            )}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>
            {node.pageType} · {(() => {
              try {
                return getPathname(node.url);
              } catch {
                return node.url || "/";
              }
            })()}
          </div>
        </button>
        {hasChildren && (
          <div
            style={{
              marginTop: "0.35rem",
              marginLeft: "0.6rem",
              paddingLeft: "0.55rem",
              borderLeft: "1px dashed rgba(148,163,184,0.45)",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.45rem",
              alignItems: "flex-start",
            }}
          >
            {(node.children || []).map((child, childIndex: number) =>
              renderMenuTree(child, depth + 1, `${lineage}.${childIndex}`)
            )}
          </div>
        )}
      </div>
    );
  };

  const mappedMenuPages = dedupeNodesByUrl(primaryMenuNodes)
    .map((node) => {
      const page = resolveNodePage(node);
      if (!page) return null;
      const pageMap = pageSectionMapList.find((item) => item.pageId === page.id);
      return {
        id: page.id,
        title: page.title || toMenuLabel(node),
        url: page.url,
        sections: (pageMap?.sections || []).slice(0, 3),
      };
    })
    .filter((item): item is MappedMenuPage => Boolean(item))
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 10);
  const recommendedEvents = selectedPageEvents.slice(0, 10);
  const selectedPageComponents = selectedPage?.components || [];
  const advancedSectionRows = selectedPageComponents
    .filter((component) => component.componentType === "info_block")
    .map((component): AdvancedStructureRow => {
      const meta = parseJson<JsonRecord>(component.metadataJson, {});
      const interactionSummary = toRecord(meta.interactionSummary);
      const actionMap = toRecord(interactionSummary.actions);
      return {
        id: component.id,
        label: component.label,
        sectionType: toStringValue(meta.blockKind, "content_section"),
        repeatCount: toNumberValue(meta.linkCount) + toNumberValue(meta.buttonCount),
        clickableCount: toNumberValue(interactionSummary.total),
        keyActions: Object.keys(actionMap).slice(0, 5),
        selector: component.selector || "-",
        domPath: toStringValue(meta.nearestSemanticAncestor),
        ocrLabel: toStringValue(meta.semanticTitle),
      };
    });
  const advancedClickableRows = selectedPageComponents
    .filter((component) => component.componentType === "interaction")
    .map((component): AdvancedClickableRow => {
      const meta = parseJson<JsonRecord>(component.metadataJson, {});
      return {
        id: component.id,
        label: component.label,
        actionType: toStringValue(meta.actionType, "trigger_ui"),
        selector: component.selector || "-",
        domPath: toStringValue(meta.ownerBlockLabel),
        ocrLabel: component.label || "-",
      };
    });

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/projects" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>← 대시보드</Link>
          <h1 style={{ fontSize: '2rem', color: '#fff', marginTop: '0.5rem' }}>{project.name}</h1>
          <a href={project.targetUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', fontSize: '0.9rem' }}>{project.targetUrl}</a>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={startAnalysis} disabled={analyzing} style={{ background: '#1f6feb' }}>
            {getAnalyzeButtonLabel()}
          </button>
          <button className="btn-primary" onClick={() => router.push(`/projects/${id}/events`)} style={{ background: 'var(--success-color)' }}>
            이벤트 설계서 보기
          </button>
        </div>
      </div>

      {(analyzing || analyzeStatus) && (
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
            <span>단계: {getAnalyzeStageLabel()}</span>
            <span>{analyzing ? `경과 ${formatElapsed(analyzeElapsedSec)}` : "완료"}</span>
          </div>
          <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, analyzeProgress))}%`,
                height: '100%',
                background: analyzeStatus === "failed" ? "var(--danger-color)" : "linear-gradient(90deg, #1f6feb, #58a6ff)",
                transition: 'width 240ms ease'
              }}
            />
          </div>
          <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            진행률 {Math.max(0, Math.min(100, analyzeProgress))}%
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>분석 대상 페이지</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{project.pages?.length || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>설계된 이벤트</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{project._count?.events || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>분석 목적</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', marginTop: '0.5rem' }}>{project.analysisGoal}</div>
        </div>
      </div>

      {llmUsage && (
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: '0.5rem' }}>AI 해석 토큰 사용량</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.8rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              모델: <span style={{ color: '#fff' }}>{llmUsage.model || '-'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              제공자: <span style={{ color: '#fff' }}>{llmUsage.provider || 'openai'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              모드: <span style={{ color: '#fff' }}>{llmUsage.llmMode || 'budget'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              입력 토큰: <span style={{ color: '#fff' }}>{llmUsage.approxInputTokens || 0}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              출력 토큰: <span style={{ color: '#fff' }}>{llmUsage.approxOutputTokens || 0}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              페이지당 입력 상한: <span style={{ color: '#fff' }}>{llmUsage.maxInputTokensPerPage || '-'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              페이지당 출력 상한: <span style={{ color: '#fff' }}>{llmUsage.maxOutputTokensPerPage || '-'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              AI 사용: <span style={{ color: '#fff' }}>{llmUsage.usedLlm ? 'Yes' : 'No'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              입력 절삭: <span style={{ color: '#fff' }}>{llmUsage.inputCapped ? 'Yes' : 'No'}</span>
            </div>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.45rem' }}>
            마지막 업데이트: {aiInterpretation?.updatedAt ? new Date(aiInterpretation.updatedAt).toLocaleString() : '-'}
          </div>
        </div>
      )}

      {(!project.pages || project.pages.length === 0) ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>웹 구조 분석이 필요합니다</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            1) 정보구조(정보 덩어리) → 2) 인터랙션 구조(클릭 결과) → 3) 전환구조(시나리오) → 4) UX 평가/이벤트 설계를 실행합니다.
          </p>
          <div style={{ display: "flex", gap: "0.7rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={startAnalysis} disabled={analyzing} style={{ padding: '1rem 1.4rem', fontSize: '1.02rem', background: '#1f6feb' }}>
              {getAnalyzeButtonLabel()}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>분석된 페이지 구조</h2>
            <button className="btn-primary" onClick={startEventGeneration} disabled={generating} style={{boxShadow: '0 0 15px rgba(88,166,255,0.4)'}}>
              {generating
                ? "4단계 분석 + GA4 이벤트 설계 중..."
                : (project._count?.events || 0) > 0
                ? "이벤트 재생성 ✨"
                : "4단계 분석 기반 이벤트 설계 ✨"}
            </button>
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
              선택 노드 라이브 뷰 (iframe)
            </h3>
            <div
              style={{
                width: '100%',
                minHeight: '520px',
                aspectRatio: '16 / 9',
                backgroundColor: '#fff',
                borderRadius: 'var(--border-radius-md)',
                overflow: 'hidden',
                border: selectedComponent ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                boxShadow: selectedComponent ? '0 0 0 4px rgba(88,166,255,0.2)' : 'none',
                position: 'relative'
              }}
            >
              <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" sandbox="allow-same-origin allow-scripts allow-forms" />
              {selectedComponent && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 2,
                    background: 'rgba(15,23,42,0.9)',
                    color: '#fff',
                    border: '1px solid rgba(88,166,255,0.7)',
                    borderRadius: '10px',
                    padding: '0.5rem 0.75rem',
                    maxWidth: '70%'
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#8ec5ff', marginBottom: '0.2rem' }}>
                    SELECTED COMPONENT
                  </div>
                  <div style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>{selectedComponent.label}</div>
                </div>
              )}
            </div>
            <p style={{ color: 'var(--warning-color)', fontSize: '0.8rem', marginTop: '0.5rem' }}>* X-Frame-Options 보안 정책을 사용하는 일부 웹사이트(예: datanugget.io 등)는 iframe 조회가 거부될 수 있습니다.</p>
            {selectedComponent && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                선택한 컴포넌트를 iframe 위 오버레이로 강조 표시했습니다.
              </p>
            )}
          </div>
          
          <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", marginBottom: "0.8rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0 }}>
                사이트맵 (페이지 흐름) · {sitemapState?.source === "override" ? "Manual" : "Auto"}
              </h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn-primary" style={{ padding: "0.4rem 0.7rem" }} onClick={() => setEditingSitemap((prev) => !prev)}>
                  {editingSitemap ? "편집 닫기" : "엣지 편집"}
                </button>
                <button className="btn-primary" style={{ padding: "0.4rem 0.7rem" }} onClick={() => setManualMode((prev) => !prev)}>
                  {manualMode ? "수동 체크 닫기" : "수동 구조 체크"}
                </button>
                <button
                  type="button"
                  onClick={resetSitemapOverride}
                  disabled={sitemapSaving}
                  style={{ padding: "0.4rem 0.7rem", background: "transparent", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px", cursor: "pointer" }}
                >
                  자동 복원
                </button>
              </div>
            </div>
            {manualMode && (
              <div className="glass-panel" style={{ marginBottom: "0.8rem", padding: "0.8rem" }}>
                <p style={{ margin: "0 0 0.5rem 0", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                  클릭 순서대로 방문한 URL을 한 줄씩 넣으면 노드/엣지를 자동 생성합니다.
                </p>
                <div style={{ display: "flex", gap: "0.45rem", marginBottom: "0.55rem", flexWrap: "wrap" }}>
                  <button className="btn-primary" onClick={fillManualUrlsFromKnownNodes} style={{ padding: "0.38rem 0.65rem" }}>
                    기존 URL 자동채우기
                  </button>
                  <button className="btn-primary" onClick={addSelectedNodeUrlToManual} style={{ padding: "0.38rem 0.65rem" }}>
                    선택 노드 URL 추가
                  </button>
                  <button
                    type="button"
                    onClick={addTargetUrlToManual}
                    style={{ padding: "0.38rem 0.65rem", background: "transparent", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px", cursor: "pointer" }}
                  >
                    타겟 URL 추가
                  </button>
                </div>
                <textarea
                  value={manualPathInput}
                  onChange={(e) => setManualPathInput(e.target.value)}
                  placeholder={"https://www.example.com/\nhttps://www.example.com/contents/keywords/all\nhttps://www.example.com/seminar"}
                  rows={5}
                  style={{ width: "100%", resize: "vertical", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.6rem" }}
                />
                <details style={{ marginTop: "0.55rem", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                  <summary style={{ cursor: "pointer", color: "#fff" }}>클릭 수집 스크립트 보기</summary>
                  <pre style={{ marginTop: "0.4rem", whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.55rem" }}>{`(function () {
  const logs = [];
  document.addEventListener("click", function (e) {
    const t = e.target && e.target.closest ? e.target.closest("a,button,[role='button'],[onclick],[data-href],[data-url]") : null;
    const href = t && (t.getAttribute("href") || t.getAttribute("data-href") || t.getAttribute("data-url"));
    setTimeout(() => {
      logs.push(location.href);
      if (href) logs.push(new URL(href, location.href).toString());
      console.log("[CAPTURED_URLS]", Array.from(new Set(logs)).join("\\n"));
    }, 600);
  }, true);
  console.log("URL capture on. Click around, then copy [CAPTURED_URLS] lines.");
})();`}</pre>
                </details>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                  <button className="btn-primary" onClick={applyManualPathCapture} style={{ padding: "0.45rem 0.75rem" }}>
                    수동 경로 반영
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPathInput("")}
                    style={{ padding: "0.45rem 0.75rem", background: "transparent", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "8px", cursor: "pointer" }}
                  >
                    입력 비우기
                  </button>
                </div>
              </div>
            )}
            {editingSitemap && (
              <div className="glass-panel" style={{ marginBottom: "0.8rem", padding: "0.8rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", alignItems: "center" }}>
                  <select
                    value={edgeForm.fromPageId}
                    onChange={(e) => setEdgeForm((prev) => ({ ...prev, fromPageId: e.target.value }))}
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  >
                    <option value="">from page</option>
                    {sitemapNodes.map((node) => (
                      <option key={`from-${node.id}`} value={node.id}>{node.title}</option>
                    ))}
                  </select>
                  <select
                    value={edgeForm.toPageId}
                    onChange={(e) => setEdgeForm((prev) => ({ ...prev, toPageId: e.target.value }))}
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  >
                    <option value="">to page</option>
                    {sitemapNodes.map((node) => (
                      <option key={`to-${node.id}`} value={node.id}>{node.title}</option>
                    ))}
                  </select>
                  <button className="btn-primary" onClick={addSitemapEdge} style={{ padding: "0.45rem 0.75rem" }}>
                    엣지 추가
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", alignItems: "center", marginTop: "0.55rem" }}>
                  <input
                    value={newNodeForm.title}
                    onChange={(e) => setNewNodeForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="새 노드 제목 (예: 인사이트)"
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  />
                  <input
                    value={newNodeForm.url}
                    onChange={(e) => setNewNodeForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://example.com/insight"
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  />
                  <button className="btn-primary" onClick={addSitemapNode} style={{ padding: "0.45rem 0.75rem" }}>
                    노드 추가
                  </button>
                </div>
                <div style={{ marginTop: "0.7rem", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {sitemapState?.edges.map((edge, index) => (
                    <div key={`${edge.fromPageId}-${edge.toPageId}-${index}`} style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", padding: "0.35rem 0.55rem", border: "1px solid var(--border-color)", borderRadius: "999px", fontSize: "0.75rem", color: "#fff" }}>
                      <span>{sitemapNodes.find((p) => p.id === edge.fromPageId)?.title || "from"}</span>
                      <span style={{ color: "var(--text-secondary)" }}>→</span>
                      <span>{sitemapNodes.find((p) => p.id === edge.toPageId)?.title || "to"}</span>
                      <button onClick={() => removeSitemapEdge(edge.fromPageId, edge.toPageId)} style={{ marginLeft: "0.2rem", background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {sitemapNodes.map((node) => (
                    <div key={`node-${node.id}`} style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", padding: "0.35rem 0.55rem", border: "1px solid var(--border-color)", borderRadius: "999px", fontSize: "0.75rem", color: "#fff" }}>
                      <span>{node.title}</span>
                      {String(node.id).startsWith("custom_") && (
                        <button onClick={() => removeSitemapNode(node.id)} style={{ marginLeft: "0.2rem", background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "0.7rem" }}>
                  <button className="btn-primary" onClick={saveSitemapOverride} disabled={sitemapSaving} style={{ padding: "0.45rem 0.75rem" }}>
                    {sitemapSaving ? "저장 중..." : "사이트맵 저장"}
                  </button>
                </div>
              </div>
            )}
            {sitemapMessage && <p style={{ margin: "0 0 0.8rem 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{sitemapMessage}</p>}
            {sitemapNodes.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: "0.9rem" }}>
                <div style={{ overflowY: 'auto', maxHeight: '560px', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'rgba(0,0,0,0.18)', padding: '0.7rem' }}>
                  <div style={{ color: '#fff', fontSize: '0.88rem', marginBottom: '0.55rem' }}>
                    메뉴 구조 (노드 트리)
                  </div>
                  {menuSectionsForView.length > 0 ? (
                    <div>
                      {renderMenuTree(mainTree, 0)}
                      <div style={{ marginTop: "0.8rem", borderTop: "1px dashed var(--border-color)", paddingTop: "0.6rem" }}>
                        <div style={{ color: "#fff", fontSize: "0.8rem", marginBottom: "0.4rem" }}>메뉴 섹션 구성</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {menuSectionsForView.map((section, idx: number) => (
                            <span
                              key={`menu-sect-chip-${section.sectionType || idx}`}
                              style={{ fontSize: "0.72rem", color: "#d1d5db", border: "1px solid var(--border-color)", borderRadius: "999px", padding: "0.2rem 0.5rem" }}
                            >
                              {section.title || section.sectionType} ({section.nodeCount || (section.trees || []).length})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      트리 루트를 찾지 못했습니다.
                    </p>
                  )}
                </div>
                <div className="glass-panel" style={{ padding: "0.65rem", minHeight: "260px" }}>
                  <div style={{ color: "#fff", fontSize: "0.9rem", marginBottom: "0.45rem" }}>선택 노드</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginBottom: "0.6rem", wordBreak: "break-all" }}>
                    {selectedSitemapNode?.title || "none"} · {previewUrl}
                  </div>
                  <div style={{ width: "100%", aspectRatio: "16 / 9", border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
                    <iframe src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} title="Mini Preview" sandbox="allow-same-origin allow-scripts allow-forms" />
                  </div>
                  <div style={{ marginTop: "0.6rem" }}>
                    <div style={{ color: "#fff", fontSize: "0.85rem", marginBottom: "0.35rem" }}>해당 페이지 이벤트</div>
                    {selectedPageEvents.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {selectedPageEvents.slice(0, 8).map((event) => (
                          <span key={event.id} style={{ fontSize: "0.73rem", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "999px", padding: "0.2rem 0.45rem" }}>
                            {event.eventName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                        이 노드와 직접 연결된 이벤트가 아직 없습니다.
                      </p>
                    )}
                  </div>
                  <div style={{ marginTop: "0.8rem", borderTop: "1px dashed var(--border-color)", paddingTop: "0.6rem" }}>
                    <div style={{ color: "#fff", fontSize: "0.83rem", marginBottom: "0.35rem" }}>메뉴 매핑 주요 페이지</div>
                    {mappedMenuPages.length > 0 ? (
                      <div style={{ display: "grid", gap: "0.38rem" }}>
                        {mappedMenuPages.map((page) => (
                          <div key={`mapped-page-${page.id}`} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.42rem 0.48rem" }}>
                            <div style={{ color: "#fff", fontSize: "0.76rem", marginBottom: "0.2rem" }}>{page.title}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", marginBottom: "0.25rem", wordBreak: "break-all" }}>{page.url}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                              {(page.sections || []).map((section, idx: number) => (
                                <span key={`mapped-sec-${page.id}-${idx}`} style={{ fontSize: "0.66rem", color: "#d1d5db", border: "1px solid var(--border-color)", borderRadius: "999px", padding: "0.15rem 0.4rem" }}>
                                  {section.sectionType}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.76rem" }}>
                        메뉴와 매핑된 페이지를 찾지 못했습니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>페이지 간 내부 이동 링크를 아직 찾지 못했습니다.</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Pages</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {project.pages.map((page) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPageId(page.id);
                        setSelectedSitemapNodeId(page.id);
                        setSelectedComponentId(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: selectedPage?.id === page.id ? 'rgba(88,166,255,0.16)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 'var(--border-radius-md)',
                        border: selectedPage?.id === page.id ? '1px solid var(--accent-color)' : '1px solid transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                    <div style={{ color: '#fff', fontWeight: '500', fontSize: '0.95rem', wordBreak: 'break-all' }}>{page.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem', wordBreak: 'break-all' }}>{page.url}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                      components {page.components?.length || 0} · events {eventCountByPage.get(page.id) || 0}
                    </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                페이지 구조 요약 ({selectedPage?.title || "page"})
              </h3>

              <div style={{ marginBottom: "0.95rem" }}>
                <div style={{ color: "#fff", fontSize: "0.92rem", marginBottom: "0.45rem" }}>대표 사용자 흐름</div>
                {coreUserFlows.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    {coreUserFlows.slice(0, 4).map((flow) => (
                      <div key={flow.flowId} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.5rem" }}>
                        <div style={{ color: "#fff", fontSize: "0.8rem", marginBottom: "0.2rem" }}>{flow.flowType}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.76rem", wordBreak: "break-word" }}>
                          {(flow.pages || []).map((page) => page.pageType || "other").join(" -> ") || "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", margin: 0 }}>대표 흐름 데이터가 없습니다.</p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "0.7rem", marginBottom: "0.9rem" }}>
                <div style={{ padding: "0.6rem", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>페이지 타입</div>
                  <div style={{ color: "#fff", fontSize: "0.93rem", marginTop: "0.2rem" }}>{selectedPageClassification?.pageType || "-"}</div>
                </div>
                <div style={{ padding: "0.6rem", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>페이지 목표</div>
                  <div style={{ color: "#fff", fontSize: "0.93rem", marginTop: "0.2rem" }}>{selectedPageClassification?.pageGoal || "-"}</div>
                </div>
                <div style={{ padding: "0.6rem", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>Primary CTA</div>
                  <div style={{ color: "#fff", fontSize: "0.93rem", marginTop: "0.2rem" }}>{selectedPageClassification?.primaryCta || "-"}</div>
                </div>
                <div style={{ padding: "0.6rem", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem" }}>Secondary CTA</div>
                  <div style={{ color: "#fff", fontSize: "0.93rem", marginTop: "0.2rem" }}>{selectedPageClassification?.secondaryCta || "-"}</div>
                </div>
              </div>

              <div style={{ marginBottom: "0.9rem" }}>
                <div style={{ color: "#fff", fontSize: "0.92rem", marginBottom: "0.45rem" }}>페이지 섹션 순서</div>
                {(orderedSections.length > 0 || keySections.length > 0) ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.5rem" }}>
                    {(orderedSections.length > 0 ? orderedSections : keySections.slice(0, 7)).map((section, idx: number) => (
                      <div key={`key-sec-${idx}`} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.55rem" }}>
                        <div style={{ color: "#fff", fontSize: "0.86rem" }}>
                          {section.order ? `${section.order}. ` : `${idx + 1}. `}
                          {section.sectionType} · {section.sectionLabel}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
                          목적: {section.sectionGoal || "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", margin: 0 }}>섹션 요약 데이터가 없습니다.</p>
                )}
              </div>

              <div style={{ marginBottom: "0.9rem" }}>
                <div style={{ color: "#fff", fontSize: "0.92rem", marginBottom: "0.45rem" }}>추천 이벤트</div>
                {recommendedEvents.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {recommendedEvents.map((event) => (
                      <span key={event.id} style={{ fontSize: "0.74rem", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "999px", padding: "0.22rem 0.5rem" }}>
                        {event.eventName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", margin: 0 }}>추천 이벤트가 아직 없습니다.</p>
                )}
              </div>

              <div style={{ marginBottom: "0.55rem" }}>
                <button
                  type="button"
                  onClick={() => setShowAdvancedStructure((prev) => !prev)}
                  style={{ padding: "0.4rem 0.7rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "#fff", cursor: "pointer" }}
                >
                  {showAdvancedStructure ? "고급 보기 접기" : "고급 보기 펼치기"}
                </button>
              </div>

              {showAdvancedStructure && (
                <div style={{ display: "grid", gap: "0.8rem" }}>
                  <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}>
                    <div style={{ color: "#fff", fontSize: "0.86rem", marginBottom: "0.45rem" }}>섹션 내부 구성요소</div>
                    {advancedSectionRows.length > 0 ? (
                      <div style={{ display: "grid", gap: "0.45rem" }}>
                        {advancedSectionRows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelectedComponentId(row.id)}
                            style={{ textAlign: "left", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.45rem", background: "rgba(255,255,255,0.02)", color: "#fff", cursor: "pointer" }}
                          >
                            <div style={{ fontSize: "0.8rem" }}>{row.sectionType} · {row.label}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem", marginTop: "0.2rem" }}>
                              핵심 액션 {row.keyActions.join(", ") || "-"} · 반복 {row.repeatCount} · clickable {row.clickableCount}
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                              selector: {row.selector} | dom path: {row.domPath} | ocr label: {row.ocrLabel}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8rem" }}>표시할 섹션 구성요소가 없습니다.</p>
                    )}
                  </div>

                  <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}>
                    <div style={{ color: "#fff", fontSize: "0.86rem", marginBottom: "0.45rem" }}>클릭 가능한 요소</div>
                    {advancedClickableRows.length > 0 ? (
                      <div style={{ display: "grid", gap: "0.4rem" }}>
                        {advancedClickableRows.slice(0, 40).map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelectedComponentId(row.id)}
                            style={{ textAlign: "left", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.42rem", background: "rgba(255,255,255,0.02)", color: "#fff", cursor: "pointer" }}
                          >
                            <div style={{ fontSize: "0.8rem" }}>{row.actionType} · {row.label}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                              selector: {row.selector} | dom path: {row.domPath} | ocr label: {row.ocrLabel}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8rem" }}>클릭 요소 데이터가 없습니다.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
