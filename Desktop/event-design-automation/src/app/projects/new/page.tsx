"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    targetUrl: "",
    toolType: "ga4",
    analysisGoal: "가입 전환",
    customGoal: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const goal = formData.analysisGoal === "직접 입력" ? formData.customGoal : formData.analysisGoal;

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          targetUrl: formData.targetUrl,
          analysisGoal: goal,
          toolType: formData.toolType,
        })
      });

      if (res.ok) {
        await res.json();
        // Route to the created project's dashboard once Project Structure is ready
        router.push(`/projects`);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "프로젝트 생성 실패");
      }
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← 대시보드로 돌아가기
        </Link>
        <h1 style={{ fontSize: '1.8rem', color: '#fff', marginTop: '1rem' }}>새 프로젝트 생성</h1>
      </div>

      <div className="glass-panel">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="name" style={{ fontWeight: '500', color: '#fff' }}>프로젝트명 <span style={{color: 'var(--error-color)'}}>*</span></label>
            <input 
              id="name"
              type="text" 
              required
              className="form-input"
              placeholder="예: OOO앱 가입 플로우 분석"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="url" style={{ fontWeight: '500', color: '#fff' }}>대상 URL <span style={{color: 'var(--error-color)'}}>*</span></label>
            <input 
              id="url"
              type="url" 
              required
              className="form-input"
              placeholder="https://example.com/signup"
              value={formData.targetUrl}
              onChange={(e) => setFormData({...formData, targetUrl: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="toolType" style={{ fontWeight: '500', color: '#fff' }}>분석 툴 <span style={{color: 'var(--error-color)'}}>*</span></label>
            <select
              id="toolType"
              className="form-input"
              value={formData.toolType}
              onChange={(e) => setFormData({...formData, toolType: e.target.value})}
            >
              <option value="ga4">GA4</option>
              <option value="amplitude">Amplitude</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="goal" style={{ fontWeight: '500', color: '#fff' }}>분석 목적 <span style={{color: 'var(--error-color)'}}>*</span></label>
            <select 
              id="goal"
              className="form-input"
              value={formData.analysisGoal}
              onChange={(e) => setFormData({...formData, analysisGoal: e.target.value})}
            >
              <option value="가입 전환">가입 전환</option>
              <option value="구매 전환">구매 전환</option>
              <option value="탐색 분석">탐색 분석</option>
              <option value="리텐션 분석">리텐션 분석</option>
              <option value="직접 입력">직접 입력</option>
            </select>
          </div>

          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            GTM/GA4/Amplitude 키는 프로젝트 생성 후 자동 태깅 버튼을 누를 때 모달에서 입력할 수 있습니다.
          </div>

          {formData.analysisGoal === "직접 입력" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="customGoal" style={{ fontWeight: '500', color: '#fff' }}>직접 입력</label>
              <input 
                id="customGoal"
                type="text" 
                required
                className="form-input"
                placeholder="입력해주세요"
                value={formData.customGoal}
                onChange={(e) => setFormData({...formData, customGoal: e.target.value})}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => router.push('/projects')} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: 'var(--border-radius-md)', cursor: 'pointer' }}>
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "생성 중..." : "프로젝트 생성하기"}
            </button>
          </div>

        </form>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: var(--border-radius-md);
          border: 1px solid var(--border-color);
          background-color: rgba(0, 0, 0, 0.2);
          color: #fff;
          font-family: inherit;
          font-size: 1rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .form-input:focus {
          outline: none;
          border-color: var(--accent-color);
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
        }
        .form-input::placeholder {
          color: var(--text-secondary);
        }
        select.form-input option {
          background-color: var(--bg-color);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
