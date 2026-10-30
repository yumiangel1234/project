import { describe, expect, it } from "vitest";
import {
  aggregate,
  inspectionOrder,
  metricsForRows,
  normalizeFilter,
  scopeRows,
  siteMetrics,
  sitesInScope,
  statusFromGap10,
  trend,
} from "@/lib/calc";
import { fmtMoney, fmtPct, fmtPp, round1 } from "@/lib/format";
import { data, filter, index } from "./helpers";

// data/검산표.md 「월별 전체 현장」: 월, 계약금액, 누적기성액, 기성률, 가중 계획, 가중 실제, 공정차이, 당월기성액, 정상, 주의, 점검
const MONTHLY: [string, number, number, number, number, number, number, number | null, number, number, number][] = [
  ["2025-10", 630700, 105449.7, 16.7, 19.4, 19.6, 0.2, null, 10, 2, 0],
  ["2025-11", 630700, 125857.8, 20.0, 22.8, 23.2, 0.3, 20408.1, 10, 2, 0],
  ["2025-12", 630700, 148530.2, 23.6, 26.9, 27.0, 0.2, 22672.4, 9, 3, 0],
  ["2026-01", 630700, 173599.9, 27.5, 31.4, 31.3, -0.1, 25069.7, 9, 3, 0],
  ["2026-02", 630700, 202848.9, 32.2, 36.7, 36.2, -0.4, 29249.0, 8, 4, 0],
  ["2026-03", 630700, 233981.1, 37.1, 42.4, 41.6, -0.8, 31132.2, 8, 3, 1],
  ["2026-04", 630700, 266640.0, 42.3, 48.6, 47.1, -1.5, 32658.9, 8, 2, 2],
  ["2026-05", 630700, 300878.0, 47.7, 54.8, 52.9, -1.9, 34238.0, 8, 1, 3],
  ["2026-06", 630700, 335344.9, 53.2, 60.7, 58.3, -2.4, 34466.9, 7, 2, 3],
  ["2026-07", 630700, 364718.5, 57.8, 65.8, 63.2, -2.6, 29373.6, 6, 2, 4],
  ["2026-08", 630700, 395184.7, 62.7, 69.9, 67.6, -2.3, 30466.2, 6, 2, 4],
  ["2026-09", 630700, 424063.4, 67.2, 73.2, 71.2, -2.0, 28878.7, 6, 3, 3],
];

describe("자료 144행", () => {
  it("원본 CSV는 144행·12개 현장입니다", () => {
    expect(data).toHaveLength(144);
    expect(new Set(data.map((r) => r.siteId)).size).toBe(12);
  });
});

describe("월별 전체 현장 (검산표)", () => {
  it.each(MONTHLY)("%s", (month, contract, earned, rate, planned, actual, gap, monthly, ok, warn, check) => {
    const agg = aggregate(scopeRows(data, filter({ month })), index);
    expect(agg.contract).toBe(contract);
    expect(round1(agg.earned!)).toBe(earned);
    expect(round1(agg.earnedRate!)).toBe(rate);
    expect(round1(agg.planned!)).toBe(planned);
    expect(round1(agg.actual!)).toBe(actual);
    expect(round1(agg.gap!)).toBe(gap);
    if (monthly === null) expect(agg.monthly).toBeNull();
    else expect(round1(agg.monthly!)).toBe(monthly);
    expect(agg.counts).toEqual({ 정상: ok, 주의: warn, 점검: check });
  });

  it("9월 화면 표시 문자열", () => {
    const agg = aggregate(scopeRows(data, filter()), index);
    expect(fmtPct(agg.earnedRate)).toBe("67.2%");
    expect(fmtPct(agg.planned)).toBe("73.2%");
    expect(fmtPct(agg.actual)).toBe("71.2%");
    expect(fmtPp(agg.gap)).toBe("-2.0pp");
    expect(fmtMoney(agg.earned)).toBe("424,063.4");
    expect(fmtMoney(agg.monthly)).toBe("28,878.7");
  });
});

// 검산표 「2026-09 현장별」: ID, 계획, 실제, 차이, 누적기성액, 기성률, 당월기성액, 상태
const SITES_SEP: [string, number, number, number, number, number, number, string][] = [
  ["A", 75.4, 77.1, 1.7, 63763.2, 73.8, 4665.6, "정상"],
  ["B", 80.3, 82.1, 1.8, 41395.2, 78.4, 3854.4, "정상"],
  ["C", 94.8, 96.2, 1.4, 41040.0, 95.0, 1166.4, "정상"],
  ["D", 86.5, 75.8, -10.7, 50384.4, 69.4, 3339.6, "점검"],
  ["E", 99.4, 99.7, 0.3, 18635.4, 98.6, 302.4, "정상"],
  ["F", 68.7, 65.3, -3.4, 22082.5, 60.5, 2117.0, "주의"],
  ["G", 52.8, 54.4, 1.6, 49448.7, 50.1, 3849.3, "정상"],
  ["H", 31.2, 29.4, -1.8, 11369.6, 27.2, 543.4, "주의"],
  ["I", 73.2, 65.6, -7.6, 34963.2, 60.7, 3052.8, "점검"],
  ["J", 95.8, 95.0, -0.8, 30034.8, 92.7, 1393.2, "주의"],
  ["K", 71.0, 65.6, -5.4, 39446.0, 60.5, 3586.0, "점검"],
  ["L", 88.1, 90.3, 2.2, 21500.4, 87.4, 1008.6, "정상"],
];

describe("2026-09 현장별 (검산표)", () => {
  const metrics = metricsForRows(scopeRows(data, filter()), index);
  it.each(SITES_SEP)("%s", (id, plan, actual, gap, earned, rate, monthly, status) => {
    const m = metrics.find((x) => x.row.siteId === id)!;
    expect(m.row.plannedProgress).toBe(plan);
    expect(m.row.actualProgress).toBe(actual);
    expect(round1(m.gap)).toBe(gap);
    expect(m.row.cumulativeEarned).toBe(earned);
    expect(round1(m.earnedRate)).toBe(rate);
    expect(round1(m.monthly!)).toBe(monthly);
    expect(m.status).toBe(status);
  });

  it("점검 순서는 D → I → K", () => {
    const order = inspectionOrder(metrics).map((m) => `${m.row.siteId}(${round1(m.gap)})`);
    expect(order).toEqual(["D(-10.7)", "I(-7.6)", "K(-5.4)"]);
  });

  it("공정차이가 같으면 현장 ID 순", () => {
    const mk = (siteId: string) => {
      const base = data.find((r) => r.siteId === "D" && r.month === "2026-09")!;
      return siteMetrics({ ...base, siteId, plannedProgress: 80, actualProgress: 70 }, null);
    };
    expect(inspectionOrder([mk("K"), mk("B"), mk("F")]).map((m) => m.row.siteId)).toEqual(["B", "F", "K"]);
  });
});

describe("지역별 필터 (검산표)", () => {
  // 지역, 현장 수, 계약금액, 누적기성액, 기성률, 정상, 주의, 점검
  const REGION: [string, number, number, number, number, number, number, number][] = [
    ["인천", 2, 185100, 113211.9, 61.2, 2, 0, 0],
    ["경기", 4, 210400, 144189.2, 68.5, 2, 1, 1],
    ["충남", 2, 55400, 40717.9, 73.5, 1, 1, 0],
    ["충북", 1, 57600, 34963.2, 60.7, 0, 0, 1],
    ["세종", 1, 32400, 30034.8, 92.7, 0, 1, 0],
    ["강원", 1, 65200, 39446.0, 60.5, 0, 0, 1],
    ["대전", 1, 24600, 21500.4, 87.4, 1, 0, 0],
  ];
  it.each(REGION)("%s", (region, n, contract, earned, rate, ok, warn, check) => {
    const agg = aggregate(scopeRows(data, filter({ region })), index);
    expect(agg.siteCount).toBe(n);
    expect(agg.contract).toBe(contract);
    expect(round1(agg.earned!)).toBe(earned);
    expect(round1(agg.earnedRate!)).toBe(rate);
    expect(agg.counts).toEqual({ 정상: ok, 주의: warn, 점검: check });
  });

  it("9월 인천·공동주택은 A·G 2곳", () => {
    const rows = scopeRows(data, filter({ region: "인천", projectType: "공동주택" }));
    expect(rows.map((r) => r.siteId)).toEqual(["A", "G"]);
  });

  it("9월 D만 고르면 기성률 69.4%", () => {
    const agg = aggregate(scopeRows(data, filter({ siteId: "D" })), index);
    expect(fmtPct(agg.earnedRate)).toBe("69.4%");
  });
});

describe("경계값·특수값", () => {
  it("계획 70·실제 70 / 65.1 / 65 → 정상 / 주의 / 점검", () => {
    const g = (actual: number) => Math.round(actual * 10) - Math.round(70 * 10);
    expect(statusFromGap10(g(70))).toBe("정상");
    expect(statusFromGap10(g(65.1))).toBe("주의");
    expect(statusFromGap10(g(65))).toBe("점검");
  });

  it("2025-10 당월기성액은 계산 불가(0이나 누적액이 아님)", () => {
    const agg = aggregate(scopeRows(data, filter({ month: "2025-10" })), index);
    expect(agg.monthly).toBeNull();
    expect(fmtMoney(agg.monthly)).toBe("계산 불가");
    expect(round1(agg.earned!)).toBe(105449.7);
  });

  it("J의 7월 당월기성액 0.0은 계산 불가가 아니라 정상값", () => {
    const m = metricsForRows(scopeRows(data, filter({ month: "2026-07", siteId: "J" })), index)[0];
    expect(m.monthly).not.toBeNull();
    expect(round1(m.monthly!)).toBe(0);
    expect(fmtMoney(m.monthly)).toBe("0.0");
  });

  it("D의 8월 → 9월 공정차이 -11.2 → -10.7", () => {
    const aug = metricsForRows(scopeRows(data, filter({ month: "2026-08", siteId: "D" })), index)[0];
    const sep = metricsForRows(scopeRows(data, filter({ siteId: "D" })), index)[0];
    expect(round1(aug.gap)).toBe(-11.2);
    expect(round1(sep.gap)).toBe(-10.7);
  });

  it("범위에 자료가 없으면 0%가 아니라 계산 불가", () => {
    const agg = aggregate(scopeRows(data, filter({ region: "대전", projectType: "공동주택" })), index);
    expect(agg.empty).toBe(true);
    expect(agg.earnedRate).toBeNull();
    expect(fmtPct(agg.earnedRate)).toBe("계산 불가");
    expect(fmtPp(agg.gap)).toBe("계산 불가");
  });

  it("전월이 없는 현장이 하나라도 있으면 전체 당월기성액은 계산 불가", () => {
    const without = data.filter((r) => !(r.month === "2026-08" && r.siteId === "A"));
    const idx = new Map(without.map((r) => [`${r.month}|${r.siteId}`, r] as const));
    const agg = aggregate(scopeRows(without, filter()), idx);
    expect(agg.monthly).toBeNull();
  });

  it("음수 영은 0.0으로 표시", () => {
    expect(fmtPp(-0.04)).toBe("0.0pp");
  });
});

describe("추이", () => {
  it("9월 전체는 12개월, 7월은 10개월(시작 월부터 선택 월까지)", () => {
    expect(trend(data, filter(), index)).toHaveLength(12);
    const t7 = trend(data, filter({ month: "2026-07" }), index);
    expect(t7).toHaveLength(10);
    expect(t7[0].month).toBe("2025-10");
    expect(t7[9].month).toBe("2026-07");
  });

  it("같은 필터로 매월 따로 집계(인천·공동주택)", () => {
    const t = trend(data, filter({ region: "인천", projectType: "공동주택" }), index);
    expect(t.every((p) => p.agg.siteCount === 2)).toBe(true);
  });
});

describe("필터 연동", () => {
  it("지역을 바꿔 고른 현장이 범위에서 빠지면 현장을 전체로 되돌림", () => {
    const r = normalizeFilter(data, filter({ siteId: "D", region: "충남" }));
    expect(r.reset).toBe(true);
    expect(r.filter.siteId).toBe("전체");
  });

  it("범위에 남아 있으면 그대로", () => {
    const r = normalizeFilter(data, filter({ siteId: "D", region: "경기" }));
    expect(r.reset).toBe(false);
    expect(r.filter.siteId).toBe("D");
  });

  it("현장 목록은 지역·유형 범위의 현장만", () => {
    expect(sitesInScope(data, "인천", "공동주택").map((s) => s.siteId)).toEqual(["A", "G"]);
    expect(sitesInScope(data, "대전", "공동주택")).toEqual([]);
  });
});
