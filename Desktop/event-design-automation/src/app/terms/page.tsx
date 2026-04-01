export default function TermsPage() {
  return (
    <div className="container" style={{ padding: "2rem", maxWidth: "900px" }}>
      <div className="glass-panel" style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "2rem", color: "#fff", marginBottom: "1rem" }}>
          이용약관
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", lineHeight: 1.7 }}>
          본 약관은 EVE(이하 “서비스”)의 이용과 관련하여 서비스와 사용자 간의 권리, 의무 및
          책임사항을 규정합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>1. 서비스의 목적</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 이벤트 설계, 분석, QA 및 관련 자동화 기능을 제공하는 웹 기반 도구입니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>2. 계정 및 접근</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          사용자는 서비스가 제공하는 로그인 방식(Google 로그인 등)을 통해 계정을 생성하거나
          접속할 수 있습니다. 사용자는 자신의 계정 정보 및 접근 권한을 적절히 관리할 책임이
          있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>3. 사용자 책임</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.75rem" }}>
          사용자는 서비스 이용 시 다음 행위를 해서는 안 됩니다.
        </p>
        <ul style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          <li>타인의 계정 또는 권한을 무단으로 사용하는 행위</li>
          <li>서비스 또는 제3자의 권리를 침해하는 행위</li>
          <li>법령, 정책 또는 공공질서에 반하는 행위</li>
          <li>서비스의 정상 운영을 방해하는 행위</li>
        </ul>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          사용자는 본인이 연결한 외부 서비스 계정 및 리소스에 대한 적법한 권한을 보유해야
          합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>
          4. 외부 서비스 연동
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 Google 계정, Google Tag Manager 등 외부 서비스와 연동될 수 있습니다. 이
          경우 사용자는 본인이 명시적으로 요청한 범위 내에서 서비스에 필요한 접근 권한을
          부여하게 됩니다. 외부 서비스의 정책 변경 또는 장애로 인해 일부 기능이 제한될 수
          있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>
          5. 데이터 및 결과
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 사용자가 입력하거나 연결한 데이터를 기반으로 결과를 생성합니다. 서비스는
          결과의 정확성, 완전성, 특정 목적 적합성을 보장하지 않으며, 사용자는 중요한 의사결정
          전에 결과를 별도로 검토해야 합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>6. 지적재산권</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스, 소프트웨어, UI, 문서 및 기타 구성 요소에 대한 권리는 서비스 운영자에게
          귀속됩니다. 다만, 사용자가 업로드하거나 입력한 데이터에 대한 권리는 해당 사용자 또는
          정당한 권리자에게 있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>
          7. 서비스 변경 및 중단
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 기능 개선, 보안, 운영상 필요에 따라 일부 또는 전부가 변경되거나 중단될 수
          있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>8. 책임 제한</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스는 관련 법령이 허용하는 범위 내에서 서비스 이용 과정에서 발생한 간접적,
          우발적 손해에 대하여 책임을 제한할 수 있습니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>9. 약관 변경</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          본 약관은 서비스 운영 정책 또는 관련 법령 변경에 따라 수정될 수 있으며, 변경 시 본
          페이지를 통해 공지합니다.
        </p>

        <h2 style={{ fontSize: "1.2rem", color: "#fff", marginBottom: "0.75rem" }}>10. 문의처</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          서비스 이용 관련 문의: yujin@weirdsector.co.kr
        </p>

        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 0 }}>
          시행일: 2026-04-02
        </p>
      </div>
    </div>
  );
}
