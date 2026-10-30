import { aggregate, inspectionOrder, metricsForRows, prevMonth, RowIndex, scopeRows, trend } from "./calc";
import { round1 } from "./format";
import { ALL, DataRow, Filter, Status } from "./types";

export const MAX_QUESTION_LENGTH = 500;
export const MAX_BODY_BYTES = 100 * 1024;
export const AI_TIMEOUT_MS = 20_000;

export const EXAMPLE_QUESTIONS = [
  "D가 늦어진 원인과 대응은?",
  "9월 점검 현장은 어디인가요?",
  "D는 회복 중인가요?",
  "실제 준공일·미수금은?",
];

type Counts = { 정상: number; 주의: number; 점검: number };

export type AiRow = {
  /** 원문 기록(파일에 있던 15개 열 그대로) */
  raw: DataRow;
  /** 프로그램이 계산한 값 */
  computed: { earnedRate: number; progressGap: number; status: Status; monthlyEarned: number | null };
};

export type AiMonthSummary =
  | { month: string; empty: true }
  | {
      month: string;
      empty: false;
      siteCount: number;
      earnedRate: number | null;
      plannedProgress: number | null;
      actualProgress: number | null;
      progressGap: number | null;
      /** 바로 전월 대비 공정차이 변화(pp). 양수면 차이가 줄어든 것, 전월 자료가 없으면 null */
      progressGapChange: number | null;
      monthlyEarned: number | null;
      counts: Counts;
    };

export type AiPayload = {
  question: string;
  scope: { month: string; region: string; projectType: string; siteId: string; siteCount: number };
  note: string;
  /** 선택 월의 원문 행과 계산 값. 원문(raw)과 계산(computed)을 구분해서 보냅니다. */
  selectedMonthRows: AiRow[];
  /** 범위 전체의 선택 월 지표(프로그램이 계산) */
  scopeSummary: {
    contractAmount: number | null;
    cumulativeEarned: number | null;
    earnedRate: number | null;
    plannedProgress: number | null;
    actualProgress: number | null;
    progressGap: number | null;
    monthlyEarned: number | null;
    counts: Counts;
  };
  /** 선택 월의 점검(공정차이 -5pp 이하) 현장 순위. 공정차이 오름차순, 같으면 현장 ID 순(프로그램이 계산) */
  inspectionRanking: { rank: number; siteId: string; siteName: string; progressGap: number; earnedRate: number }[];
  /** 같은 필터로 시작 월~선택 월을 월별로 집계한 요약(프로그램이 계산) */
  monthlySummary: AiMonthSummary[];
  /** 현장 한 곳을 골랐을 때만: 그 현장의 시작 월~선택 월 원문 기록과 계산 값 */
  monthlyRecords?: AiRow[];
};

export type AiErrorCode =
  | "BAD_REQUEST"
  | "NO_KEY"
  | "KEY_INVALID"
  | "QUOTA"
  | "TIMEOUT"
  | "CONNECTION"
  | "MODEL"
  | "BLOCKED"
  | "UPSTREAM"
  | "BAD_RESPONSE";

export type AiResponse =
  | {
      ok: true;
      /** 모의 응답이면 true — 실제 AI 성공으로 오인하지 않도록 화면에 표시합니다. */
      mock: boolean;
      answer: string;
      usedMonths: string[];
      usedSites: string[];
      usedFields: string[];
    }
  | { ok: false; code: AiErrorCode; message: string };

const n = (x: number | null | undefined): number | null => (x == null ? null : round1(x));

function toAiRow(m: ReturnType<typeof metricsForRows>[number]): AiRow {
  return {
    raw: m.row,
    computed: {
      earnedRate: round1(m.earnedRate),
      progressGap: round1(m.gap),
      status: m.status,
      monthlyEarned: n(m.monthly),
    },
  };
}

/** 지금 필터 범위의 숫자는 프로그램이 모두 계산해 두고, AI에게는 그 값과 원문 기록만 보냅니다. */
export function buildAiPayload(data: DataRow[], index: RowIndex, filter: Filter, question: string): AiPayload {
  const rows = scopeRows(data, filter);
  const metrics = metricsForRows(rows, index);
  const agg = aggregate(rows, index);

  const points = trend(data, filter, index);
  const monthlySummary: AiMonthSummary[] = points.map((p, i) => {
    if (p.agg.empty) return { month: p.month, empty: true as const };
    const prev = i > 0 && points[i - 1].month === prevMonth(p.month) ? points[i - 1].agg : null;
    return {
      month: p.month,
      empty: false as const,
      siteCount: p.agg.siteCount,
      earnedRate: n(p.agg.earnedRate),
      plannedProgress: n(p.agg.planned),
      actualProgress: n(p.agg.actual),
      progressGap: n(p.agg.gap),
      progressGapChange: prev && !prev.empty ? n(p.agg.gap! - prev.gap!) : null,
      monthlyEarned: n(p.agg.monthly),
      counts: p.agg.counts,
    };
  });

  const payload: AiPayload = {
    question,
    scope: {
      month: filter.month,
      region: filter.region,
      projectType: filter.projectType,
      siteId: filter.siteId,
      siteCount: rows.length,
    },
    note:
      "raw는 파일에 기록된 원문입니다(issueSummary는 기록된 상황, actionPlan은 계획된 대응이며 원인 확정·완료 사실이 아닙니다). " +
      "computed와 scopeSummary, monthlySummary는 프로그램이 계산한 값입니다(금액 백만원, 비율 %, 공정차이 pp). " +
      "monthlyEarned가 null이면 전월 자료가 없어 계산 불가입니다. 이 자료는 교육용 가상 자료입니다.",
    selectedMonthRows: metrics.map(toAiRow),
    scopeSummary: {
      contractAmount: n(agg.contract),
      cumulativeEarned: n(agg.earned),
      earnedRate: n(agg.earnedRate),
      plannedProgress: n(agg.planned),
      actualProgress: n(agg.actual),
      progressGap: n(agg.gap),
      monthlyEarned: n(agg.monthly),
      counts: agg.counts,
    },
    inspectionRanking: inspectionOrder(metrics).map((m, i) => ({
      rank: i + 1,
      siteId: m.row.siteId,
      siteName: m.row.siteName,
      progressGap: round1(m.gap),
      earnedRate: round1(m.earnedRate),
    })),
    monthlySummary,
  };

  if (filter.siteId !== ALL) {
    payload.monthlyRecords = monthlySummary.flatMap((s) =>
      metricsForRows(scopeRows(data, filter, s.month), index).map(toAiRow),
    );
  }
  return payload;
}

/** 서버가 받은 요청을 검사합니다. 형식이 맞지 않으면 사유를 돌려줍니다. */
export function checkAiPayload(x: unknown): string | null {
  if (typeof x !== "object" || x === null) return "요청 형식이 올바르지 않습니다.";
  const p = x as Partial<AiPayload>;
  if (typeof p.question !== "string" || p.question.trim() === "") return "질문이 비어 있습니다.";
  if (p.question.length > MAX_QUESTION_LENGTH) return `질문은 ${MAX_QUESTION_LENGTH}자 이내로 입력해 주세요.`;
  if (typeof p.scope !== "object" || p.scope === null) return "범위 정보가 없습니다.";
  if (!Array.isArray(p.selectedMonthRows) || !Array.isArray(p.monthlySummary)) return "자료 형식이 올바르지 않습니다.";
  if (p.selectedMonthRows.length > 12 || p.monthlySummary.length > 12) return "전달 자료가 너무 많습니다.";
  if (p.monthlyRecords !== undefined && (!Array.isArray(p.monthlyRecords) || p.monthlyRecords.length > 12)) {
    return "월별 기록 형식이 올바르지 않습니다.";
  }
  return null;
}
