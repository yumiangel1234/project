"use client";

import { useRouter } from "next/navigation";
import { Aggregate, SiteMetrics } from "@/lib/calc";
import { fmtPct, fmtPp } from "@/lib/format";
import { useData } from "./DataProvider";

/** 점검(공정차이 -5pp 이하) 현장 순위. 한 줄을 누르면 비교표로 가서 그 줄을 강조하고 기록을 펼칩니다. */
export function InspectionList({ inspection, agg }: { inspection: SiteMetrics[]; agg: Aggregate }) {
  const router = useRouter();
  const { setHighlight } = useData();

  if (inspection.length === 0) {
    return (
      <section className="state-box" data-testid="no-inspection">
        <h2>점검 대상 없음</h2>
        <p>이 범위에는 점검이 필요한 현장(공정차이 -5pp 이하)이 없습니다.</p>
        {agg.counts.주의 > 0 && <p>주의 {agg.counts.주의}곳은 현장별 비교표에서 확인할 수 있습니다.</p>}
      </section>
    );
  }

  return (
    <section className="insp-list" data-testid="inspection-list" aria-label="점검이 필요한 현장">
      <h2>점검이 필요한 현장 (공정차이 -5pp 이하, 작은 순)</h2>
      <p className="muted">현장을 누르면 현장별 비교표에서 그 줄을 강조하고 기록을 펼칩니다.</p>
      <ol>
        {inspection.map((m, i) => (
          <li key={m.row.siteId}>
            <button
              className="insp-item"
              data-testid={`insp-${m.row.siteId}`}
              onClick={() => {
                setHighlight(m.row.siteId);
                router.push("/sites");
              }}
            >
              <span className="insp-rank">{i + 1}</span>
              <span className="insp-name">
                <strong>{m.row.siteId}</strong> · {m.row.siteName.replace("[가상] ", "")}
                <br />
                <small>
                  {m.row.region} · {m.row.projectType}
                </small>
              </span>
              <span className="insp-num">
                <span>계획</span>
                {fmtPct(m.row.plannedProgress)}
              </span>
              <span className="insp-num">
                <span>실제</span>
                {fmtPct(m.row.actualProgress)}
              </span>
              <span className="insp-num gap">
                <span>차이</span>
                {fmtPp(m.gap)}
              </span>
              <span className="insp-num">
                <span>기성률</span>
                {fmtPct(m.earnedRate)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {agg.counts.주의 > 0 && <p className="muted">주의 {agg.counts.주의}곳은 현장별 비교표에서 확인할 수 있습니다.</p>}
    </section>
  );
}
