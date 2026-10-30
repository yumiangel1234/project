import { Aggregate } from "@/lib/calc";
import { fmtAmount, fmtMoney, fmtPct, fmtPp, NA } from "@/lib/format";

function Card({ id, label, value, sub, tone }: { id: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`metric ${tone ?? ""}`} data-testid={`metric-${id}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

/** 큰 숫자 4개(기성률·계획·실제·공정차이)와 금액·상태 요약 한 줄. */
export function Metrics({ agg }: { agg: Aggregate }) {
  const gapTone = agg.gap === null ? "" : agg.gap < 0 ? "neg" : "pos";
  return (
    <section aria-label="전체 지표">
      <div className="metrics">
        <Card id="earnedRate" label="전체 기성률" value={fmtPct(agg.earnedRate)} sub="누적기성액 ÷ 계약금액" />
        <Card id="planned" label="계획 공정률" value={fmtPct(agg.planned)} sub="계약금액 가중평균" />
        <Card id="actual" label="실제 공정률" value={fmtPct(agg.actual)} sub="계약금액 가중평균" />
        <Card id="gap" label="공정차이" value={fmtPp(agg.gap)} sub="실제 − 계획" tone={gapTone} />
      </div>
      <dl className="summary-line" data-testid="summary-line">
        <div>
          <dt>계약금액</dt>
          <dd data-testid="sum-contract">{agg.empty ? NA : `${fmtAmount(agg.contract)} 백만원`}</dd>
        </div>
        <div>
          <dt>누적기성액</dt>
          <dd data-testid="sum-earned">{agg.empty ? NA : `${fmtMoney(agg.earned)} 백만원`}</dd>
        </div>
        <div>
          <dt>당월기성액</dt>
          <dd data-testid="sum-monthly">{agg.monthly === null ? NA : `${fmtMoney(agg.monthly)} 백만원`}</dd>
        </div>
        <div>
          <dt>상태 내역</dt>
          <dd data-testid="sum-counts">
            {agg.empty
              ? NA
              : `정상 ${agg.counts.정상}곳 · 주의 ${agg.counts.주의}곳 · 점검 ${agg.counts.점검}곳`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
