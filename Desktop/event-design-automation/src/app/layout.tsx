import type { Metadata } from "next";
import Script from "next/script";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Event Design Automation",
  description: "AI-based UI/UX analysis & event design automation platform",
};

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-TFDVB8ZP";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <Script
          id="gtm-base"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Sidebar />
        <main style={{ marginLeft: '250px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {children}
          <footer
            style={{
              marginTop: "auto",
              padding: "1.5rem 2rem",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              gap: "1rem",
              justifyContent: "flex-start",
            }}
          >
            <a href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>
              개인정보처리방침
            </a>
            <a href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>
              이용약관
            </a>
          </footer>
        </main>
      </body>
    </html>
  );
}
