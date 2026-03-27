"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type EventProperty = {
  propertyName: string;
  exampleValue?: string | null;
};

type TrackingEvent = {
  id: string;
  status: string;
  priority: string;
  eventName: string;
  description: string;
  triggerCondition: string;
  triggerType: string;
  sourceType?: string | null;
  properties?: EventProperty[];
};

type ProjectSummary = {
  name: string;
  toolType?: string | null;
  gtmAccountId?: string | null;
  gtmContainerId?: string | null;
  gtmWorkspaceId?: string | null;
  ga4MeasurementId?: string | null;
  amplitudeApiKey?: string | null;
};

export default function EventsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoTagging, setAutoTagging] = useState(false);
  const [autoTagNotice, setAutoTagNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modal state
  const [editingEvent, setEditingEvent] = useState<TrackingEvent | null>(null);
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
      if (eRes.ok) setEvents((await eRes.json()) as TrackingEvent[]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateEventStatus = async (eventId: string, newStatus: string) => {
    try {
      await fetch(`/api/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e)));
    } catch (error) {
      console.error(error);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (error) {
      console.error(error);
    }
  };

  const downloadTrackingPlan = () => {
    window.open(`/api/projects/${id}/export`, "_blank");
  };

  const runGtmAutoTagging = async () => {
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

    try {
      setAutoTagging(true);
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

  const handleSaveModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingEvent),
      });
      if (res.ok) {
        setEvents((prev) => prev.map((ev) => (ev.id === editingEvent.id ? editingEvent : ev)));
        setEditingEvent(null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "approved") return "var(--success-color)";
    if (status === "ready_for_dev") return "var(--accent-color)";
    return "var(--warning-color)";
  };

  const getSourceMeta = (sourceType?: string | null) => {
    if (sourceType === "ga4_recommended") {
      return { label: "GA4 Recommended", color: "#1f9d55", border: "rgba(31,157,85,0.5)" };
    }
    return { label: "Custom", color: "#2563eb", border: "rgba(37,99,235,0.5)" };
  };

  const getEventCode = (ev: TrackingEvent) => {
    return ev.properties?.find((p) => p.propertyName === "event_code")?.exampleValue || "-";
  };

  const inferredToolType = project?.toolType === "amplitude" ? "amplitude" : "ga4";

  if (loading) return <div className="container" style={{padding: '2rem'}}>Loading...</div>;

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href={`/projects/${id}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>← 프로젝트 개요 ({project?.name})</Link>
          <h1 style={{ fontSize: '2rem', color: '#fff', marginTop: '0.5rem' }}>이벤트 설계 목록</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={downloadTrackingPlan} style={{ background: 'var(--success-color)' }}>
            로그정의서 자동 생성
          </button>
          <button className="btn-primary" onClick={runGtmAutoTagging} disabled={autoTagging} style={{ background: 'var(--accent-color)' }}>
            {autoTagging ? "GTM 자동 태깅 중..." : "승인 이벤트 GTM 자동 태깅"}
          </button>
          <button className="btn-primary" onClick={() => router.push(`/projects/${id}/export`)}>
            구현 가이드 보기
          </button>
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

      <div className="glass-panel" style={{ padding: '0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>상태</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>우선순위</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>이벤트명</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>설명</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>트리거 조건</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'right' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem' }}>
                  <select 
                    value={ev.status} 
                    onChange={(e) => updateEventStatus(ev.id, e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.3)', color: getStatusColor(ev.status), border: `1px solid ${getStatusColor(ev.status)}`, padding: '0.3rem 0.5rem', borderRadius: '4px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="draft">Review Need</option>
                    <option value="approved">Approved</option>
                    <option value="ready_for_dev">Dev Ready</option>
                  </select>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{ev.priority}</td>
                <td style={{ padding: '1rem', color: '#fff', fontWeight: 'bold' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span>{ev.eventName}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {getEventCode(ev)}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 'fit-content',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: getSourceMeta(ev.sourceType).color,
                        border: `1px solid ${getSourceMeta(ev.sourceType).border}`,
                        borderRadius: '999px',
                        padding: '0.15rem 0.45rem'
                      }}
                    >
                      {getSourceMeta(ev.sourceType).label}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{ev.description}</td>
                <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{ev.triggerCondition} <span style={{ color: 'var(--accent-color)', display: 'block', fontSize: '0.75rem', marginTop: '0.2rem' }}>[{ev.triggerType}]</span></td>
                <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button onClick={() => setEditingEvent(ev)} style={{ background: 'none', border: '1px solid var(--text-secondary)', color: '#fff', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }} className="edit-btn">
                    편집
                  </button>
                  <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: '1px solid transparent', color: 'var(--error-color)', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>설계된 이벤트가 없습니다. AI 추천을 받아보세요.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingEvent && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', backgroundColor: 'var(--bg-color)', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#fff' }}>이벤트 상세 편집</h2>
            <form onSubmit={handleSaveModal} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>이벤트명 &lt;event_name&gt;</label>
                <input type="text" value={editingEvent.eventName} onChange={e => setEditingEvent({...editingEvent, ...{eventName: e.target.value}})} required style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>기능 설명</label>
                <input type="text" value={editingEvent.description || ''} onChange={e => setEditingEvent({...editingEvent, ...{description: e.target.value}})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>트리거 타입 (Trigger)</label>
                  <input type="text" value={editingEvent.triggerType || ''} onChange={e => setEditingEvent({...editingEvent, ...{triggerType: e.target.value}})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} placeholder="예: click, load, submit"/>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>우선순위 (Priority)</label>
                  <select value={editingEvent.priority || 'MEDIUM'} onChange={e => setEditingEvent({...editingEvent, ...{priority: e.target.value}})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>상세 발동 조건 (Condition)</label>
                <textarea value={editingEvent.triggerCondition || ''} onChange={e => setEditingEvent({...editingEvent, ...{triggerCondition: e.target.value}})} rows={3} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff', resize: 'vertical' }} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" onClick={() => setEditingEvent(null)} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>취소</button>
                <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem' }}>저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        .edit-btn:hover {
          background-color: var(--accent-color) !important;
          border-color: var(--accent-color) !important;
        }
        select option {
          background-color: var(--bg-color);
        }
      `}</style>
    </div>
  );
}
