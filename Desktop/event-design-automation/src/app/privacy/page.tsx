export default function PrivacyPolicyPage() {
  return (
    <div className="container" style={{ padding: "2rem", maxWidth: "900px" }}>
      <div className="glass-panel" style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "2rem", color: "#fff", marginBottom: "1rem" }}>
          개인정보처리방침
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", lineHeight: 1.7 }}>
          EVE(이하 “서비스”)는 사용자의 개인정보를 중요하게 생각하며, 관련 법령 및 Google API
          Services User Data Policy를 준수하기 위해 본 개인정보처리방침을 제공합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>1. 수집하는 정보</h2>
        <ul style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          <li>회원 로그인 정보(이름, 이메일 주소, 프로필 정보)</li>
          <li>사용자가 연결한 Google 계정 관련 인증 정보</li>
          <li>사용자가 명시적으로 연결한 Google Tag Manager(GTM) 리소스 정보</li>
          <li>프로젝트, 이벤트 정의서, 분석 실행 기록, 결과 조회 기록</li>
          <li>서비스 이용 과정에서 생성되는 로그 정보(접속 기록, 활동 로그, 오류 로그 등)</li>
        </ul>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>2. 정보 수집 목적</h2>
        <ul style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          <li>사용자 인증 및 로그인 처리</li>
          <li>워크스페이스 및 프로젝트 접근 권한 관리</li>
          <li>사용자가 요청한 GTM 연동 및 자동 태깅 기능 제공</li>
          <li>분석 결과 제공 및 서비스 개선</li>
          <li>오류 대응, 보안 점검, 비정상 접근 방지</li>
        </ul>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>
          3. Google 사용자 데이터 이용
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.75rem" }}>
          서비스는 사용자가 명시적으로 요청한 경우에 한해 Google 계정 및 Google Tag Manager
          데이터에 접근합니다. 이 데이터는 다음 목적에만 사용됩니다.
        </p>
        <ul style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          <li>사용자의 GTM 계정/컨테이너 식별</li>
          <li>사용자가 요청한 태그, 트리거, 변수 등의 생성 또는 수정</li>
          <li>연동 상태 확인 및 기능 제공</li>
        </ul>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 사용자의 명시적 요청 없이 GTM 리소스를 임의로 변경하지 않습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>
          4. 정보 보관 및 보호
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 수집한 정보를 서비스 운영 및 보안 목적 범위 내에서 보관합니다. 인증 정보 및
          연동 정보는 접근 통제가 적용된 저장소 또는 데이터베이스에 보관되며, 무단 접근, 변경,
          유출을 방지하기 위해 합리적인 보호 조치를 적용합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>5. 제3자 제공</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 법령상 요구가 있는 경우를 제외하고, 사용자의 개인정보를 제3자에게 판매하거나
          무단 제공하지 않습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>6. 사용자 권리</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          사용자는 언제든지 서비스 연결 해제, 계정 삭제, 개인정보 삭제 요청을 할 수 있습니다.
          Google 계정 권한은 Google 계정의 보안 설정 또는 연결된 앱 관리 화면에서 철회할 수
          있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>7. 문의처</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          개인정보 및 데이터 처리 관련 문의: yujin@weirdsector.co.kr
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>8. 정책 변경</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.5rem" }}>
          본 개인정보처리방침은 서비스 변경 또는 관련 법령 변경에 따라 수정될 수 있습니다.
          변경 시 본 페이지를 통해 공지합니다.
        </p>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 0 }}>
          시행일: 2026-04-02
        </p>
      </div>
    </div>
  );
}
