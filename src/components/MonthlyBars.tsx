"use client";

import { TrendPoint } from "@/lib/calc";
import { fmtMoney, NA, round1 } from "@/lib/format";

const W = 640;
const H = 280;
const M = { l: 16, r: 16, t: 24, b: 44 };

/** 월별 당월기성액(전월 누적과의 차액) 막대. 누적기성액이 아닙니다. */
export function MonthlyBars({ points }: { points: TrendPoint[] }) {
  const vals = points.flatMap((p) => (p.agg.monthly === null ? [] : [round1(p.agg.monthly)]));
  const max = Math.max(1, ...vals) * 1.12;
  const slot = (W - M.l - M.r) / Math.max(points.length, 1);
  const barW = Math.min(36, slot * 0.62);
  const base = H - M.b;
  const h = (v: number) => (v / max) * (base - M.t);

  return (
    <div className="chart-card" data-testid="monthly-bars">
      <h3>월별 기성액 (당월기성액, 백만원)</h3>
      <p className="muted">전월 누적기성액과의 차이입니다. 전월 자료가 없는 달은 "{NA}"이며 누적액으로 대신하지 않습니다.</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월별 당월기성액 막대 그래프" className="chart">
        <line x1={M.l} x2={W - M.r} y1={base} y2={base} className="grid" />
        {points.map((p, i) => {
          const cx = M.l + slot * i + slot / 2;
          const m = p.agg.monthly;
          return (
            <g key={p.month}>
              {m === null ? (
                <text x={cx} y={base - 8} textAnchor="middle" className="axis na">
                  {p.agg.empty ? "자료 없음" : NA}
                </text>
              ) : (
                <>
                  <rect
                    x={cx - barW / 2}
                    y={base - Math.max(h(round1(m)), 2)}
                    width={barW}
                    height={Math.max(h(round1(m)), 2)}
                    className="bar"
                  >
                    <title>{`${p.month} 당월기성액 ${fmtMoney(m)}`}</title>
                  </rect>
                  <text x={cx} y={base - Math.max(h(round1(m)), 2) - 5} textAnchor="middle" className="axis val">
                    {fmtMoney(m)}
                  </text>
                </>
              )}
              <text x={cx} y={base + 16} textAnchor="middle" className="axis">
                {p.month.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
      <details>
        <summary>표로 보기</summary>
        <table className="table compact">
          <thead>
            <tr>
              <th>월</th>
              <th>누적기성액</th>
              <th>당월기성액</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month}>
                <td>{p.month}</td>
                <td>{p.agg.empty ? "자료 없음" : fmtMoney(p.agg.earned)}</td>
                <td>{p.agg.empty ? "자료 없음" : fmtMoney(p.agg.monthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
