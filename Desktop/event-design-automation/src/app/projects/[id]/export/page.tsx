"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ProjectSummary = {
  name: string;
  toolType?: string | null;
  gtmAccountId?: string | null;
  gtmContainerId?: string | null;
  gtmWorkspaceId?: string | null;
  ga4MeasurementId?: string | null;
  amplitudeApiKey?: string | null;
};

type TrackingEvent = {
  id: string;
  status: string;
  eventName: string;
  triggerType: string;
  triggerCondition: string;
  description: string;
};

export default function ExportGuidePage() {
  const { id } = useParams();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoTagging, setAutoTagging] = useState(false);
  const [activeTab, setActiveTab] = useState("gtm");
  const [showAutoTagModal, setShowAutoTagModal] = useState(false);
  const [autoTagMissing, setAutoTagMissing] = useState<string[]>([]);
  const [autoTagForm, setAutoTagForm] = useState({
    accessToken: "",
    gtmAccountId: "",
    gtmContainerId: "",
    gtmWorkspaceId: "",
    ga4MeasurementId: "",
    amplitudeApiKey: "",
    persistConfig: true,
  });
  const [autoTagNotice, setAutoTagNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const inferredToolType = project?.toolType === "amplitude" ? "amplitude" : "ga4";

  const fetchData = useCallback(async () => {
    try {
      const pRes = await fetch(`/api/projects/${id}`);
      if (pRes.ok) {
        const projectData = (await pRes.json()) as ProjectSummary;
        setProject(projectData);
        setAutoTagForm((prev) => ({
          ...prev,
          gtmAccountId: projectData.gtmAccountId || "",
          gtmContainerId: projectData.gtmContainerId || "",
          gtmWorkspaceId: projectData.gtmWorkspaceId || "",
          ga4MeasurementId: projectData.ga4MeasurementId || "",
          amplitudeApiKey: projectData.amplitudeApiKey || "",
        }));
      }

      const eRes = await fetch(`/api/projects/${id}/events`);
      if (eRes.ok) {
        const allEvents = (await eRes.json()) as TrackingEvent[];
        // Only show guides for approved/ready events
        setEvents(allEvents.filter((ev) => ev.status === "approved" || ev.status === "ready_for_dev"));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownloadCsv = () => {
    window.open(`/api/projects/${id}/export`, '_blank');
  };

  const handleDownloadGtmJson = () => {
    window.open(`/api/projects/${id}/export/gtm`, '_blank');
  };

  const handleRunGtmAutoTagging = async () => {
    const toolType = project?.toolType === "amplitude" ? "amplitude" : "ga4";
    const requiredFields =
      toolType === "amplitude"
        ? ["GTM_ACCESS_TOKEN", "GTM_ACCOUNT_ID", "GTM_CONTAINER_ID", "GTM_WORKSPACE_ID", "AMPLITUDE_API_KEY"]
        : ["GTM_ACCESS_TOKEN", "GTM_ACCOUNT_ID", "GTM_CONTAINER_ID", "GTM_WORKSPACE_ID", "GTM_GA4_MEASUREMENT_ID"];
    setAutoTagNotice(null);
    setAutoTagMissing(requiredFields);
    setShowAutoTagModal(true);
  };

  const submitAutoTagModal = async (e: FormEvent) => {
    e.preventDefault();
    setAutoTagNotice(null);
    setAutoTagging(true);
    try {
      const payload: Record<string, string | boolean> = {
        persistConfig: autoTagForm.persistConfig,
      };

      if (autoTagMissing.includes("GTM_ACCESS_TOKEN")) payload.accessToken = autoTagForm.accessToken;
      if (autoTagMissing.includes("GTM_ACCOUNT_ID")) payload.gtmAccountId = autoTagForm.gtmAccountId;
      if (autoTagMissing.includes("GTM_CONTAINER_ID")) payload.gtmContainerId = autoTagForm.gtmContainerId;
      if (autoTagMissing.includes("GTM_WORKSPACE_ID")) payload.gtmWorkspaceId = autoTagForm.gtmWorkspaceId;
      if (autoTagMissing.includes("GTM_GA4_MEASUREMENT_ID")) payload.ga4MeasurementId = autoTagForm.ga4MeasurementId;
      if (autoTagMissing.includes("AMPLITUDE_API_KEY")) payload.amplitudeApiKey = autoTagForm.amplitudeApiKey;
      const requiredEmpty =
        (autoTagMissing.includes("GTM_ACCESS_TOKEN") && !autoTagForm.accessToken.trim()) ||
        (autoTagMissing.includes("GTM_ACCOUNT_ID") && !autoTagForm.gtmAccountId.trim()) ||
        (autoTagMissing.includes("GTM_CONTAINER_ID") && !autoTagForm.gtmContainerId.trim()) ||
        (autoTagMissing.includes("GTM_WORKSPACE_ID") && !autoTagForm.gtmWorkspaceId.trim()) ||
        (autoTagMissing.includes("GTM_GA4_MEASUREMENT_ID") && !autoTagForm.ga4MeasurementId.trim()) ||
        (autoTagMissing.includes("AMPLITUDE_API_KEY") && !autoTagForm.amplitudeApiKey.trim());
      if (requiredEmpty) {
        setAutoTagNotice({ type: "error", message: "필수 값을 모두 입력해주세요." });
        return;
      }

      const res = await fetch(`/api/projects/${id}/gtm/auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data?.missing)) {
          setAutoTagMissing(data.missing as string[]);
          setAutoTagNotice({ type: "error", message: "일부 입력값이 부족합니다. 다시 확인해주세요." });
          return;
        }
        setAutoTagNotice({ type: "error", message: data.message || data.error || "GTM 자동 태깅 실패" });
        return;
      }

      setShowAutoTagModal(false);
      setAutoTagNotice({
        type: "success",
        message:
          `자동 태깅 완료 · createdTriggers ${data?.result?.createdTriggers ?? 0}, ` +
          `createdTags ${data?.result?.createdTags ?? 0}, ` +
          `skippedTriggers ${data?.result?.skippedTriggers ?? 0}, ` +
          `skippedTags ${data?.result?.skippedTags ?? 0}`,
      });
    } catch (error) {
      console.error(error);
      setAutoTagNotice({ type: "error", message: "GTM 자동 태깅 실행 중 오류가 발생했습니다." });
    } finally {
      setAutoTagging(false);
    }
  };

  if (loading) return <div className="container" style={{padding: '2rem'}}>Loading...</div>;

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href={`/projects/${id}/events`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>← 이벤트 목록</Link>
          <h1 style={{ fontSize: '2rem', color: '#fff', marginTop: '0.5rem' }}>로그정의서 및 구현 가이드</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {project?.name ? `${project.name} · ` : ""}승인 완료된 이벤트({events.length}개)에 대한 개발 가이드입니다.
          </p>
        </div>
        <div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-primary" onClick={handleDownloadCsv} disabled={events.length === 0} style={{ background: 'var(--success-color)', padding: '0.75rem 1.2rem' }}>
              CSV 다운로드
            </button>
            <button className="btn-primary" onClick={handleDownloadGtmJson} disabled={events.length === 0} style={{ background: 'var(--accent-color)', padding: '0.75rem 1.2rem' }}>
              GTM JSON 다운로드
            </button>
            <button className="btn-primary" onClick={handleRunGtmAutoTagging} disabled={events.length === 0 || autoTagging} style={{ background: '#0f766e', padding: '0.75rem 1.2rem' }}>
              {autoTagging ? "GTM 자동 태깅 중..." : "승인 이벤트 GTM 자동 태깅"}
            </button>
          </div>
        </div>
      </div>
      {autoTagNotice && (
        <div
          className="glass-panel"
          style={{
            marginBottom: "1rem",
            borderColor: autoTagNotice.type === "success" ? "rgba(31,157,85,0.6)" : "rgba(220,38,38,0.6)",
          }}
        >
          <p style={{ margin: 0, color: autoTagNotice.type === "success" ? "#86efac" : "#fca5a5" }}>{autoTagNotice.message}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button className={`tab-btn ${activeTab === 'gtm' ? 'active' : ''}`} onClick={() => setActiveTab('gtm')}>GTM 가이드</button>
        <button className={`tab-btn ${activeTab === 'datalayer' ? 'active' : ''}`} onClick={() => setActiveTab('datalayer')}>dataLayer 예시</button>
        <button className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`} onClick={() => setActiveTab('code')}>코드 스니펫</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {events.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>승인(Approved) 또는 구현 대기(Dev Ready) 상태의 이벤트가 없습니다.</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>이벤트 설계 목록에서 상태를 변경해 주세요.</p>
          </div>
        ) : events.map(ev => (
          <div key={ev.id} className="glass-panel" style={{ padding: '1.5rem', transition: 'box-shadow 0.2s' }}>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--accent-color)', marginBottom: '1rem' }}>{ev.eventName}</h3>
            
            {activeTab === 'gtm' && (
              <div>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.8', paddingLeft: '1.5rem', fontSize: '0.95rem' }}>
                  <li><strong>추천 트리거 타입:</strong> {ev.triggerType}</li>
                  <li><strong>트리거 조건 설명:</strong> {ev.triggerCondition}</li>
                  <li><strong>기능 설명:</strong> {ev.description}</li>
                </ul>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.8rem' }}>
                  GTM JSON에는 이 이벤트를 기준으로 Custom Event Trigger / GA4 Event Tag draft가 포함됩니다.
                </p>
              </div>
            )}

            {activeTab === 'datalayer' && (
              <pre style={{ background: 'rgba(0,0,0,0.4)', padding: '1.5rem', borderRadius: 'var(--border-radius-md)', color: '#fff', overflowX: 'auto', border: '1px solid var(--border-color)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {`dataLayer.push({
  "event": "${ev.eventName}",
  "trigger_type": "${ev.triggerType}",
  // Add other properties here
});`}
              </pre>
            )}

            {activeTab === 'code' && (
              <pre style={{ background: 'rgba(0,0,0,0.4)', padding: '1.5rem', borderRadius: 'var(--border-radius-md)', color: '#fff', overflowX: 'auto', border: '1px solid var(--border-color)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {`// Example for Frontend JavaScript
trackEvent("${ev.eventName}", {
  trigger_type: "${ev.triggerType}"
});`}
              </pre>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background-color: rgba(0, 0, 0, 0.2);
          color: #fff;
          font-size: 0.95rem;
        }
        .helper-box {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          padding: 0.75rem 0.9rem;
          color: var(--text-secondary);
          font-size: 0.88rem;
          margin-bottom: 0.2rem;
        }
        .helper-box strong {
          display: block;
          color: #fff;
          margin-bottom: 0.35rem;
          font-size: 0.9rem;
        }
        .helper-box p {
          margin: 0;
          line-height: 1.45;
        }
        .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 1.1rem;
          padding: 0.5rem 0.5rem;
          cursor: pointer;
          transition: color 0.2s;
        }
        .tab-btn:hover {
          color: #fff;
        }
        .tab-btn.active {
          color: var(--accent-color);
          font-weight: bold;
          border-bottom: 2px solid var(--accent-color);
        }
      `}</style>

      {showAutoTagModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', backgroundColor: 'var(--bg-color)', padding: '2rem' }}>
            <h2 style={{ marginBottom: '0.5rem', color: '#fff' }}>자동 태깅 설정 입력</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              자동 태깅에 필요한 값을 입력한 뒤 실행합니다.
            </p>
            <div className="helper-box">
              {inferredToolType === "ga4" ? (
                <>
                  <strong>GA4 태깅 입력 안내</strong>
                  <p>`GTM_GA4_MEASUREMENT_ID`는 `G-XXXXXXX` 형식입니다.</p>
                </>
              ) : (
                <>
                  <strong>Amplitude 태깅 입력 안내</strong>
                  <p>`AMPLITUDE_API_KEY`는 해당 프로젝트 Data API Key 값입니다.</p>
                </>
              )}
            </div>
            <form onSubmit={submitAutoTagModal} style={{ display: 'grid', gap: '0.85rem' }}>
              {autoTagMissing.includes("GTM_ACCESS_TOKEN") && (
                <input className="form-input" type="text" placeholder="GTM Access Token" value={autoTagForm.accessToken} onChange={(e) => setAutoTagForm({ ...autoTagForm, accessToken: e.target.value })} />
              )}
              {autoTagMissing.includes("GTM_ACCOUNT_ID") && (
                <input className="form-input" type="text" placeholder="GTM Account ID" value={autoTagForm.gtmAccountId} onChange={(e) => setAutoTagForm({ ...autoTagForm, gtmAccountId: e.target.value })} />
              )}
              {autoTagMissing.includes("GTM_CONTAINER_ID") && (
                <input className="form-input" type="text" placeholder="GTM Container ID" value={autoTagForm.gtmContainerId} onChange={(e) => setAutoTagForm({ ...autoTagForm, gtmContainerId: e.target.value })} />
              )}
              {autoTagMissing.includes("GTM_WORKSPACE_ID") && (
                <input className="form-input" type="text" placeholder="GTM Workspace ID" value={autoTagForm.gtmWorkspaceId} onChange={(e) => setAutoTagForm({ ...autoTagForm, gtmWorkspaceId: e.target.value })} />
              )}
              {autoTagMissing.includes("GTM_GA4_MEASUREMENT_ID") && (
                <input className="form-input" type="text" placeholder="GA4 Measurement ID (G-...)" value={autoTagForm.ga4MeasurementId} onChange={(e) => setAutoTagForm({ ...autoTagForm, ga4MeasurementId: e.target.value })} />
              )}
              {autoTagMissing.includes("AMPLITUDE_API_KEY") && (
                <input className="form-input" type="text" placeholder="Amplitude API Key" value={autoTagForm.amplitudeApiKey} onChange={(e) => setAutoTagForm({ ...autoTagForm, amplitudeApiKey: e.target.value })} />
              )}
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={autoTagForm.persistConfig} onChange={(e) => setAutoTagForm({ ...autoTagForm, persistConfig: e.target.checked })} />
                프로젝트 설정으로 저장
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAutoTagModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                  취소
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '0.7rem 1.2rem' }} disabled={autoTagging}>
                  {autoTagging ? "실행 중..." : "자동 태깅 실행"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
