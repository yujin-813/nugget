import Link from 'next/link';

export default function Sidebar() {
  return (
    <aside className="glass-panel" style={{ width: '250px', height: '100vh', position: 'fixed', top: 0, left: 0, borderRight: '1px solid var(--glass-border)', borderRadius: 0, display: 'flex', flexDirection: 'column', padding: '2rem 1rem', zIndex: 100 }}>
      <div style={{ marginBottom: '2rem', padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 'bold' }}>EventDesign<span style={{color: 'var(--accent-color)'}}>.ai</span></h2>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Link href="/" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-md)', transition: 'all 0.2s', display: 'block', color: 'var(--text-primary)', textDecoration: 'none' }} className="nav-link">
          홈
        </Link>
        <Link href="/projects" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--border-radius-md)', transition: 'all 0.2s', display: 'block', color: 'var(--text-primary)', textDecoration: 'none' }} className="nav-link">
          프로젝트 관리
        </Link>
      </nav>

      <style>{`
        .nav-link:hover {
          background-color: rgba(255,255,255,0.05);
          color: #fff !important;
          transform: translateX(4px);
        }
      `}</style>
    </aside>
  );
}
