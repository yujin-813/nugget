import Link from "next/link";

export default function Home() {
  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
        <h1 style={{fontSize: '2rem', marginBottom: '1rem', color: '#fff'}}>AI 이벤트 설계 자동화 시스템</h1>
        <p style={{marginBottom: '2rem', color: 'var(--text-secondary)', lineHeight: 1.6}}>
          웹사이트 URL을 입력하면 페이지 구조와 주요 인터랙션 요소를 분석하고,<br/> 이를 기반으로 사용자 행동 이벤트를 AI가 자동 추천합니다.
        </p>
        <Link href="/projects/new" style={{ textDecoration: 'none' }}>
          <button className="btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>프로젝트 시작하기</button>
        </Link>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>
            개인정보처리방침
          </Link>
          <Link href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>
            이용약관
          </Link>
        </div>
      </div>
    </div>
  );
}
