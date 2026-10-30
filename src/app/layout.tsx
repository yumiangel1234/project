import type { Metadata } from "next";
import { DataProvider } from "@/components/DataProvider";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "현장 공정·기성 대시보드",
  description: "교육용 가상 현장의 공정·기성 현황을 확인하는 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DataProvider>
          <Header />
          {children}
        </DataProvider>
      </body>
    </html>
  );
}
