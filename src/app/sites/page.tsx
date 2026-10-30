"use client";

import { Fragment, useEffect, useState } from "react";
import { ExportButton } from "@/components/ExportButton";
import { FilterBar } from "@/components/FilterBar";
import { useData } from "@/components/DataProvider";
import { NoData } from "@/components/NoData";
import { StatusBadge } from "@/components/StatusBadge";
import { useScope } from "@/components/useScope";
import { fmtAmount, fmtMoney, fmtPct, fmtPp } from "@/lib/format";

const COLS = 12;

export default function SitesPage() {
  const { data, highlightSite } = useData();
  const scope = useScope();
  // 점검 순위에서 들어오면 그 현장의 기록을 펼친 채로 시작합니다.
  const [open, setOpen] = useState<Set<string>>(() => new Set(highlightSite ? [highlightSite] : []));

  useEffect(() => {
    if (!highlightSite) return;
    setOpen((prev) => new Set(prev).add(highlightSite));
    document.querySelector(`[data-site-row="${highlightSite}"]`)?.scrollIntoView({ block: "center" });
  }, [highlightSite]);

  if (!data || !scope) {
    return (
      <main className="page">
        <h1>현장별 비교표</h1>
        <NoData />
      </main>
    );
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="page">
      <h1>현장별 비교표</h1>
      <FilterBar />
      <ExportButton />
      {scope.agg.empty ? (
        <section className="state-box" data-testid="empty-scope">
          <h2>선택 범위에 자료가 없습니다</h2>
          <p>조건에 맞는 현장이 없습니다. 지역·유형·현장을 바꿔 보세요.</p>
        </section>
      ) : (
        <div className="table-scroll card">
          <table className="table" data-testid="sites-table">
            <thead>
              <tr>
                <th>현장</th>
                <th>지역</th>
                <th>유형</th>
                <th>당월 주요 공종</th>
                <th className="num">계약금액(백만원)</th>
                <th className="num">누적기성액(백만원)</th>
                <th className="num">기성률</th>
                <th className="num">계획</th>
                <th className="num">실제</th>
                <th className="num">공정차이</th>
                <th className="num">당월기성액(백만원)</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {scope.metrics.map((m) => {
                const r = m.row;
                const isOpen = open.has(r.siteId);
                const isHi = highlightSite === r.siteId;
                return (
                  <Fragment key={r.siteId}>
                    <tr
                      className={`site-row${isHi ? " highlight" : ""}`}
                      data-site-row={r.siteId}
                      data-highlight={isHi ? "true" : undefined}
                      onClick={() => toggle(r.siteId)}
                    >
                      <td>
                        <button className="toggle" aria-expanded={isOpen} aria-controls={`detail-${r.siteId}`}>
                          {isOpen ? "▾" : "▸"} <strong>{r.siteId}</strong> {r.siteName.replace("[가상] ", "")}
                        </button>
                      </td>
                      <td>{r.region}</td>
                      <td>{r.projectType}</td>
                      <td>{r.currentWork}</td>
                      <td className="num">{fmtAmount(r.contractAmount)}</td>
                      <td className="num">{fmtMoney(r.cumulativeEarned)}</td>
                      <td className="num">{fmtPct(m.earnedRate)}</td>
                      <td className="num">{fmtPct(r.plannedProgress)}</td>
                      <td className="num">{fmtPct(r.actualProgress)}</td>
                      <td className="num">{fmtPp(m.gap)}</td>
                      <td className="num" data-testid={`monthly-${r.siteId}`}>
                        {fmtMoney(m.monthly)}
                      </td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row" id={`detail-${r.siteId}`} data-detail={r.siteId}>
                        <td colSpan={COLS}>
                          <dl className="detail-grid">
                            <dt>공사기간</dt>
                            <dd>
                              {r.startDate} ~ {r.contractEndDate}{" "}
                              <span className="muted">(계약상 일정이며 실제 완료일이 아닙니다)</span>
                            </dd>
                            <dt>특이사항 분류</dt>
                            <dd>{r.issueCategory}</dd>
                            <dt>기록된 상황</dt>
                            <dd>{r.issueSummary}</dd>
                            <dt>계획된 대응</dt>
                            <dd>{r.actionPlan}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        기성률은 금액 기준, 공정률은 공정 기준이라 같지 않을 수 있습니다. 당월기성액은 바로 전월 자료가 있을 때만 계산하며, 없으면 "계산 불가"입니다. 상태는 공정차이로 판정합니다.
      </p>
    </main>
  );
}
