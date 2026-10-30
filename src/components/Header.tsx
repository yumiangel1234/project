"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "./DataProvider";

const NAV = [
  { href: "/", label: "현황 요약" },
  { href: "/sites", label: "현장별 비교표" },
  { href: "/import", label: "자료 가져오기" },
  { href: "/ask", label: "AI에게 묻기" },
];

export function Header() {
  const pathname = usePathname();
  const { meta } = useData();
  return (
    <header className="app-header">
      <div className="brand">
        <strong>현장 공정·기성 대시보드</strong>
        <span className="badge-synthetic">교육용 가상 자료</span>
      </div>
      <nav aria-label="주 메뉴">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={pathname === n.href ? "nav-link active" : "nav-link"}
            aria-current={pathname === n.href ? "page" : undefined}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="data-chip" data-testid="data-chip">
        {meta ? `현재 자료 ${meta.rowCount}행 · ${meta.siteCount}개 현장` : "현재 자료 없음"}
      </div>
    </header>
  );
}
