export default function LoginPage() {
  return (
    <div className="glass-panel" style={{ padding: "2.5rem", width: "420px", textAlign: "center" }}>
      <h1 style={{ color: "#fff", marginBottom: "0.75rem" }}>EventDesign.ai</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.8rem" }}>
        Google 계정으로 로그인하고 워크스페이스를 시작하세요.
      </p>
      <a
        href="/api/auth/google"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          background: "#1f6feb",
          color: "#fff",
          padding: "0.75rem 1.2rem",
          borderRadius: "10px",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Google로 로그인
      </a>
    </div>
  );
}
