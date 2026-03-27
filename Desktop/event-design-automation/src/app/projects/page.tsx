"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  targetUrl: string;
  analysisGoal: string;
  createdAt: string;
  _count: {
    events: number;
    pages?: number;
  };
}

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error("Failed to load projects", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("정말 프로젝트를 삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      fetchProjects();
    } catch (error) {
      console.error("Failed to delete project", error);
    }
  };

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#fff' }}>프로젝트 대시보드</h1>
        <button 
          className="btn-primary" 
          onClick={() => router.push('/projects/new')}
        >
          + 새 프로젝트 생성
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>프로젝트를 불러오는 중입니다...</p>
      ) : projects.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>아직 생성된 프로젝트가 없습니다.</p>
          <button className="btn-primary" onClick={() => router.push('/projects/new')}>첫 프로젝트 시작하기</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {projects.map((p) => (
            <Link href={`/projects/${p.id}`} key={p.id} style={{textDecoration: 'none'}}>
              <div 
                className="glass-panel project-card" 
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                <h3 style={{ fontSize: '1.2rem', color: 'var(--accent-color)', marginBottom: '0.5rem' }}>{p.name}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.targetUrl}
                </p>
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>
                    목적: <span style={{color: '#ccc'}}>{p.analysisGoal}</span><br/>
                    저장된 이벤트: <span style={{color: '#ccc', fontWeight: 'bold'}}>{p._count.events} 개</span>
                  </div>
                  <div>
                    <button 
                      onClick={(e) => deleteProject(p.id, e)}
                      style={{ background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem' }}
                    >삭제</button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .project-card {
          transition: transform 0.2s, box-shadow 0.2s, background-color 0.2s;
        }
        .project-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 40px rgba(0,0,0,0.6);
          background-color: rgba(32, 38, 47, 0.7);
        }
      `}</style>
    </div>
  );
}
