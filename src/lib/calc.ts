import { ALL, DataRow, Filter, PROJECT_TYPES, REGIONS, Status } from "./types";

/** 바로 전월(달력 기준). 2026-01 → 2025-12 */
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type SiteMetrics = {
  row: DataRow;
  /** 누적기성액 ÷ 계약금액 × 100 */
  earnedRate: number;
  /** 실제공정률 − 계획공정률 (pp) */
  gap: number;
  /** 소수 첫째 자리를 10배 한 정수 차이(판정·정렬용, 계산 오차 방지) */
  gap10: number;
  status: Status;
  /** 바로 전월 행이 있을 때만 값이 있고, 없으면 null(계산 불가) */
  monthly: number | null;
};

export function statusFromGap10(gap10: number): Status {
  if (gap10 >= 0) return "정상";
  if (gap10 > -50) return "주의";
  return "점검";
}

export function siteMetrics(row: DataRow, prev?: DataRow | null): SiteMetrics {
  const gap10 = Math.round(row.actualProgress * 10) - Math.round(row.plannedProgress * 10);
  return {
    row,
    earnedRate: (row.cumulativeEarned / row.contractAmount) * 100,
    gap: row.actualProgress - row.plannedProgress,
    gap10,
    status: statusFromGap10(gap10),
    monthly: prev ? row.cumulativeEarned - prev.cumulativeEarned : null,
  };
}

export type RowIndex = Map<string, DataRow>;

export function buildIndex(data: DataRow[]): RowIndex {
  const idx: RowIndex = new Map();
  for (const r of data) idx.set(`${r.month}|${r.siteId}`, r);
  return idx;
}

export function distinctMonths(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.month))].sort();
}

function orderBy(list: string[], order: string[]): string[] {
  return [...list].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function distinctRegions(data: DataRow[]): string[] {
  return orderBy([...new Set(data.map((r) => r.region))], REGIONS);
}

export function distinctTypes(data: DataRow[]): string[] {
  return orderBy([...new Set(data.map((r) => r.projectType))], PROJECT_TYPES);
}

export type SiteInfo = { siteId: string; siteName: string; region: string; projectType: string };

export function allSites(data: DataRow[]): SiteInfo[] {
  const map = new Map<string, SiteInfo>();
  for (const r of data) {
    if (!map.has(r.siteId)) {
      map.set(r.siteId, {
        siteId: r.siteId,
        siteName: r.siteName,
        region: r.region,
        projectType: r.projectType,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.siteId.localeCompare(b.siteId));
}

/** 지역·유형 조건에 맞는 현장(현장 선택 목록). */
export function sitesInScope(data: DataRow[], region: string, projectType: string): SiteInfo[] {
  return allSites(data).filter(
    (s) =>
      (region === ALL || s.region === region) && (projectType === ALL || s.projectType === projectType),
  );
}

function matches(r: DataRow, f: Filter): boolean {
  return (
    (f.region === ALL || r.region === f.region) &&
    (f.projectType === ALL || r.projectType === f.projectType) &&
    (f.siteId === ALL || r.siteId === f.siteId)
  );
}

/** 지역·유형·현장 필터에 맞는 한 달치 행(현장 ID 순). */
export function scopeRows(data: DataRow[], f: Filter, month: string = f.month): DataRow[] {
  return data
    .filter((r) => r.month === month && matches(r, f))
    .sort((a, b) => a.siteId.localeCompare(b.siteId));
}

export type StatusCounts = { 정상: number; 주의: number; 점검: number };

export type Aggregate = {
  /** 범위에 행이 없음 → 모든 값이 null (0%로 대신하지 않음) */
  empty: boolean;
  siteCount: number;
  contract: number | null;
  earned: number | null;
  earnedRate: number | null;
  planned: number | null;
  actual: number | null;
  /** 반올림 전 가중 실제 − 반올림 전 가중 계획 */
  gap: number | null;
  /** 모든 현장에 전월 값이 있을 때만 합산, 하나라도 없으면 null */
  monthly: number | null;
  counts: StatusCounts;
};

export function aggregate(rows: DataRow[], index: RowIndex): Aggregate {
  const counts: StatusCounts = { 정상: 0, 주의: 0, 점검: 0 };
  if (rows.length === 0) {
    return {
      empty: true,
      siteCount: 0,
      contract: null,
      earned: null,
      earnedRate: null,
      planned: null,
      actual: null,
      gap: null,
      monthly: null,
      counts,
    };
  }
  let contract = 0;
  let earned = 0;
  let plannedSum = 0;
  let actualSum = 0;
  let monthly: number | null = 0;
  for (const r of rows) {
    contract += r.contractAmount;
    earned += r.cumulativeEarned;
    plannedSum += r.contractAmount * r.plannedProgress;
    actualSum += r.contractAmount * r.actualProgress;
    const prev = index.get(`${prevMonth(r.month)}|${r.siteId}`) ?? null;
    const m = siteMetrics(r, prev);
    counts[m.status]++;
    if (m.monthly === null) monthly = null;
    else if (monthly !== null) monthly += m.monthly;
  }
  const planned = plannedSum / contract;
  const actual = actualSum / contract;
  return {
    empty: false,
    siteCount: rows.length,
    contract,
    earned,
    earnedRate: (earned / contract) * 100,
    planned,
    actual,
    gap: actual - planned,
    monthly,
    counts,
  };
}

export function metricsForRows(rows: DataRow[], index: RowIndex): SiteMetrics[] {
  return rows.map((r) => siteMetrics(r, index.get(`${prevMonth(r.month)}|${r.siteId}`) ?? null));
}

/** 점검 상태 현장을 공정차이 오름차순, 같으면 현장 ID 순으로. */
export function inspectionOrder(metrics: SiteMetrics[]): SiteMetrics[] {
  return metrics
    .filter((m) => m.status === "점검")
    .sort((a, b) => a.gap10 - b.gap10 || a.row.siteId.localeCompare(b.row.siteId));
}

export type TrendPoint = { month: string; agg: Aggregate };

/** 자료의 시작 월부터 선택 월까지, 같은 지역·유형·현장 범위로 매월 따로 집계. */
export function trend(data: DataRow[], f: Filter, index: RowIndex): TrendPoint[] {
  return distinctMonths(data)
    .filter((m) => m <= f.month)
    .map((month) => ({ month, agg: aggregate(scopeRows(data, f, month), index) }));
}

/** 지역·유형이 바뀌어 고른 현장이 범위에서 빠지면 현장을 전체로 되돌립니다. */
export function normalizeFilter(data: DataRow[], f: Filter): { filter: Filter; reset: boolean } {
  if (f.siteId === ALL) return { filter: f, reset: false };
  const ok = sitesInScope(data, f.region, f.projectType).some((s) => s.siteId === f.siteId);
  return ok ? { filter: f, reset: false } : { filter: { ...f, siteId: ALL }, reset: true };
}

export function defaultFilter(data: DataRow[]): Filter {
  const months = distinctMonths(data);
  return { month: months[months.length - 1] ?? "", region: ALL, projectType: ALL, siteId: ALL };
}
