"use client";

import { useState } from "react";
import { TrendPoint } from "@/lib/calc";
import { fmtPct, fmtPp, NA } from "@/lib/format";

const W = 640;
const H = 280;
const M = { l: 48, r: 16, t: 20, b: 44 };

/** 선택 월까지의 계획·실제 공정률(계약금액 가중평균). 자료 없는 월은 선을 잇지 않습니다. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.flatMap((p) => (p.agg.empty ? [] : [p.agg.planned!, p.agg.actual!]));
  const lo = vals.length ? Math.floor(Math.min(...vals) / 10) * 10 : 0;
  const hi = vals.length ? Math.max(lo + 10, Math.ceil(Math.max(...vals) / 10) * 10) : 100;
  const x = (i: number) => M.l + (points.length <= 1 ? 0 : (i * (W - M.l - M.r)) / (points.length - 1));
  const y = (v: number) => M.t + ((hi - v) * (H - M.t - M.b)) / (hi - lo);

  const path = (pick: (p: TrendPoint) => number | null) => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = pick(p);
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);

  return (
    <div className="chart-card" data-testid="trend-chart">
      <h3>계획·실제 공정률 추이</h3>
      <p className="muted">
        {points[0]?.month} ~ {points[points.length - 1]?.month} ({points.length}개월) · 같은 지역·유형·현장 범위로 매월 따로 집계
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="계획·실제 공정률 추이 그래프" className="chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {t}%
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y={H - M.b + 16} textAnchor="middle" className="axis">
            {p.month.slice(2)}
          </text>
        ))}
        <path d={path((p) => (p.agg.empty ? null : p.agg.planned))} className="line planned" />
        <path d={path((p) => (p.agg.empty ? null : p.agg.actual))} className="line actual" />
        {points.map((p, i) =>
          p.agg.empty ? (
            <text key={p.month} x={x(i)} y={H - M.b - 6} textAnchor="middle" className="axis">
              자료 없음
            </text>
          ) : (
            <g key={p.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle cx={x(i)} cy={y(p.agg.planned!)} r={4} className="dot planned" />
              <circle cx={x(i)} cy={y(p.agg.actual!)} r={4} className="dot actual" />
              <rect x={x(i) - 14} y={M.t} width={28} height={H - M.t - M.b} fill="transparent">
                <title>{`${p.month} 계획 ${fmtPct(p.agg.planned)} · 실제 ${fmtPct(p.agg.actual)} · 차이 ${fmtPp(p.agg.gap)}`}</title>
              </rect>
            </g>
          ),
        )}
        {hover !== null && !points[hover].agg.empty && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="hover-line" />
            <g transform={`translate(${Math.min(Math.max(x(hover) - 70, M.l), W - M.r - 140)},${M.t})`}>
              <rect width={140} height={52} rx={4} className="tip-bg" />
              <text x={8} y={16} className="tip">
                {points[hover].month}
              </text>
              <text x={8} y={30} className="tip">
                계획 {fmtPct(points[hover].agg.planned)}
              </text>
              <text x={8} y={44} className="tip">
                실제 {fmtPct(points[hover].agg.actual)}
              </text>
            </g>
          </g>
        )}
      </svg>
      <div className="legend">
        <span>
          <i className="swatch planned" /> 계획
        </span>
        <span>
          <i className="swatch actual" /> 실제
        </span>
      </div>
      <details>
        <summary>표로 보기</summary>
        <table className="table compact">
          <thead>
            <tr>
              <th>월</th>
              <th>계획</th>
              <th>실제</th>
              <th>공정차이</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month}>
                <td>{p.month}</td>
                <td>{p.agg.empty ? "자료 없음" : fmtPct(p.agg.planned)}</td>
                <td>{p.agg.empty ? "자료 없음" : fmtPct(p.agg.actual)}</td>
                <td>{p.agg.empty ? NA : fmtPp(p.agg.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
