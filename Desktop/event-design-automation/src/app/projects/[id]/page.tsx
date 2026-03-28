"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<number>(0);
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

  useEffect(() => {
    fetchProject();
  }, [id]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setSelectedPageId((prev) => prev || data?.pages?.[0]?.id || null);
        setSelectedSitemapNodeId((prev) => prev || data?.pages?.[0]?.id || null);
        const sitemapRes = await fetch(`/api/projects/${id}/sitemap`);
        if (sitemapRes.ok) {
          const sitemapData = await sitemapRes.json();
          const nodes = Array.isArray(sitemapData?.sitemap?.nodes) ? sitemapData.sitemap.nodes : [];
          setSitemapState({
            source: sitemapData?.source === "override" ? "override" : "auto",
            nodes,
            edges: Array.isArray(sitemapData?.sitemap?.edges) ? sitemapData.sitemap.edges : [],
          });
          if (!selectedSitemapNodeId && nodes.length > 0) {
            setSelectedSitemapNodeId(nodes[0].id);
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeStatus("queued");
    setAnalyzeProgress(0);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, { method: "POST" });
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
      const res = await fetch(`/api/projects/${id}/events/recommend`, { method: "POST" });
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
    project?.pages?.find((page: any) => page.id === selectedPageId) ??
    (selectedSitemapNodeId
      ? (project?.pages?.find((page: any) => page.id === selectedSitemapNodeId) ?? null)
      : (project?.pages?.[0] ?? null));
  const selectedComponent =
    selectedPage?.components?.find((comp: any) => comp.id === selectedComponentId) || null;

  const eventCountByPage = new Map<string, number>();
  (project?.events || []).forEach((event: any) => {
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
      sitemapEdges.map((edge: any) => [`${edge.fromPageId}->${edge.toPageId}`, edge])
    ).values()
  );

  const sitemapNodes: Array<{ id: string; url: string; title: string }> = sitemapState?.nodes?.length
    ? sitemapState.nodes
    : (project?.pages || []).map((page: any) => ({ id: page.id, url: page.url, title: page.title || "Untitled" }));

  const selectedSitemapNode =
    sitemapNodes.find((node: { id: string }) => node.id === selectedSitemapNodeId) || sitemapNodes[0] || null;

  const pageDepth = new Map<string, number>();
  sitemapNodes.forEach((page: any) => {
    try {
      const parsed = new URL(page.url);
      const depth = parsed.pathname.split("/").filter(Boolean).length;
      pageDepth.set(page.id, depth);
    } catch {
      pageDepth.set(page.id, 0);
    }
  });

  const depthGroups = new Map<number, any[]>();
  sitemapNodes.forEach((page: any) => {
    const depth = pageDepth.get(page.id) || 0;
    const group = depthGroups.get(depth) || [];
    group.push(page);
    depthGroups.set(depth, group);
  });

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const nodeWidth = 210;
  const nodeHeight = 64;
  const colGap = 140;
  const rowGap = 34;
  const graphPadding = 28;
  const maxRows = Math.max(1, ...Array.from(depthGroups.values()).map((group) => group.length));
  const graphWidth = graphPadding * 2 + sortedDepths.length * nodeWidth + Math.max(0, sortedDepths.length - 1) * colGap;
  const graphHeight = graphPadding * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap;

  const nodePosition = new Map<string, { x: number; y: number }>();
  sortedDepths.forEach((depth, colIndex) => {
    const pagesInDepth = depthGroups.get(depth) || [];
    pagesInDepth.forEach((page, rowIndex) => {
      const x = graphPadding + colIndex * (nodeWidth + colGap);
      const y = graphPadding + rowIndex * (nodeHeight + rowGap);
      nodePosition.set(page.id, { x, y });
    });
  });

  const getAnalyzeButtonLabel = () => {
    if (!analyzing) return "구조 재분석";
    if (analyzeStatus === "queued") return "분석 대기 중...";
    if (analyzeStatus === "running") return `분석 중... ${analyzeProgress}%`;
    if (analyzeStatus === "completed") return "분석 완료";
    if (analyzeStatus === "failed") return "분석 실패";
    return "분석 중...";
  };

  if (loading) return <div className="container" style={{padding: '2rem'}}>Loading...</div>;
  if (!project) return <div className="container" style={{padding: '2rem'}}>Project not found.</div>;

  const previewUrl = selectedSitemapNode?.url || selectedPage?.url || project.targetUrl;
  const selectedPageEvents = selectedPage
    ? (project?.events || []).filter((event: any) => event.pageId === selectedPage.id)
    : [];

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/projects" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>← 대시보드</Link>
          <h1 style={{ fontSize: '2rem', color: '#fff', marginTop: '0.5rem' }}>{project.name}</h1>
          <a href={project.targetUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', fontSize: '0.9rem' }}>{project.targetUrl}</a>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={startAnalysis} disabled={analyzing} style={{ background: 'var(--warning-color)' }}>
            {getAnalyzeButtonLabel()}
          </button>
          <button className="btn-primary" onClick={() => router.push(`/projects/${id}/events`)} style={{ background: 'var(--success-color)' }}>
            이벤트 설계서 보기
          </button>
        </div>
      </div>

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

      {(!project.pages || project.pages.length === 0) ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>웹 구조 분석이 필요합니다</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            1) 정보구조(정보 덩어리) → 2) 인터랙션 구조(클릭 결과) → 3) 전환구조(시나리오) → 4) UX 평가/이벤트 설계를 실행합니다.
          </p>
          <button className="btn-primary" onClick={startAnalysis} disabled={analyzing} style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
            {analyzing ? getAnalyzeButtonLabel() : "구조 분석 실행하기"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>분석된 페이지 구조</h2>
            {project._count?.events === 0 && (
              <button className="btn-primary" onClick={startEventGeneration} disabled={generating} style={{boxShadow: '0 0 15px rgba(88,166,255,0.4)'}}>
                {generating ? "4단계 분석 + GA4 이벤트 설계 중..." : "4단계 분석 기반 이벤트 설계 ✨"}
              </button>
            )}
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
            {editingSitemap && (
              <div className="glass-panel" style={{ marginBottom: "0.8rem", padding: "0.8rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", alignItems: "center" }}>
                  <select
                    value={edgeForm.fromPageId}
                    onChange={(e) => setEdgeForm((prev) => ({ ...prev, fromPageId: e.target.value }))}
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  >
                    <option value="">from page</option>
                    {sitemapNodes.map((node: any) => (
                      <option key={`from-${node.id}`} value={node.id}>{node.title}</option>
                    ))}
                  </select>
                  <select
                    value={edgeForm.toPageId}
                    onChange={(e) => setEdgeForm((prev) => ({ ...prev, toPageId: e.target.value }))}
                    style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "0.5rem" }}
                  >
                    <option value="">to page</option>
                    {sitemapNodes.map((node: any) => (
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
                      <span>{sitemapNodes.find((p: any) => p.id === edge.fromPageId)?.title || "from"}</span>
                      <span style={{ color: "var(--text-secondary)" }}>→</span>
                      <span>{sitemapNodes.find((p: any) => p.id === edge.toPageId)?.title || "to"}</span>
                      <button onClick={() => removeSitemapEdge(edge.fromPageId, edge.toPageId)} style={{ marginLeft: "0.2rem", background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {sitemapNodes.map((node: any) => (
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
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'rgba(0,0,0,0.18)' }}>
                  <svg width={Math.max(graphWidth, 900)} height={Math.max(graphHeight, 220)}>
                    <defs>
                      <marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                        <path d="M0,0 L10,4 L0,8 z" fill="rgba(148,163,184,0.9)" />
                      </marker>
                    </defs>

                    {uniqueSitemapEdges.map((edge: any, index: number) => {
                      const from = nodePosition.get(edge.fromPageId);
                      const to = nodePosition.get(edge.toPageId);
                      if (!from || !to) return null;
                      const x1 = from.x + nodeWidth;
                      const y1 = from.y + nodeHeight - 12;
                      const x2 = to.x;
                      const y2 = to.y + 12;
                      const bend = Math.max(24, (x2 - x1) / 2);
                      const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
                      return <path key={`edge-${index}`} d={d} fill="none" stroke="rgba(148,163,184,0.55)" strokeWidth="1.3" markerEnd="url(#arrow)" />;
                    })}

                    {sitemapNodes.map((page: any) => {
                      const pos = nodePosition.get(page.id);
                      if (!pos) return null;
                      const isSelected = selectedSitemapNode?.id === page.id;
                      const fill = isSelected ? "rgba(88,166,255,0.26)" : "rgba(255,255,255,0.08)";
                      const stroke = isSelected ? "rgba(88,166,255,0.9)" : "rgba(148,163,184,0.55)";
                      const pageTitle = (page.title || "Untitled").slice(0, 22);
                      return (
                        <g
                          key={page.id}
                          onClick={() => {
                            setSelectedSitemapNodeId(page.id);
                            const relatedPage = (project.pages || []).find((p: any) => p.id === page.id);
                            setSelectedPageId(relatedPage?.id || null);
                            setSelectedComponentId(null);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <rect x={pos.x} y={pos.y} rx="10" ry="10" width={nodeWidth} height={nodeHeight} fill={fill} stroke={stroke} strokeWidth="1.4" />
                          <text x={pos.x + 12} y={pos.y + 24} fill="#fff" fontSize="12" fontWeight="600" stroke="rgba(15,23,42,0.95)" strokeWidth="2" paintOrder="stroke">
                            {pageTitle}
                          </text>
                          <text x={pos.x + 12} y={pos.y + 46} fill="#9ca3af" fontSize="11" stroke="rgba(15,23,42,0.95)" strokeWidth="2" paintOrder="stroke">
                            /{(() => {
                              try {
                                return new URL(page.url).pathname.replace(/^\//, "") || "";
                              } catch {
                                return "";
                              }
                            })()}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
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
                        {selectedPageEvents.slice(0, 8).map((event: any) => (
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
                {project.pages.map((page: any) => (
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
                추출된 컴포넌트 ({selectedPage?.title || "page"})
              </h3>
              {selectedPage?.components?.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  {selectedPage.components.map((comp: any) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => setSelectedComponentId(comp.id)}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: selectedComponentId === comp.id ? 'rgba(88,166,255,0.22)' : 'rgba(0,0,0,0.3)',
                        borderRadius: 'var(--border-radius-md)',
                        border: selectedComponentId === comp.id ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', backgroundColor: 'var(--accent-color)', color: '#fff', fontSize: '0.7rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                        {comp.componentType.toUpperCase()}
                      </span>
                      <div style={{ color: '#fff', fontSize: '0.9rem', wordBreak: 'break-word' }}>{comp.label}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>추출된 주요 요소가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
