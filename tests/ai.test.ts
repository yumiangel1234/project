import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiPayload, checkAiPayload, MAX_QUESTION_LENGTH } from "@/lib/ai";
import { classifyHttpError, GEMINI_MODEL, handleAsk, parseAnswer, SYSTEM_INSTRUCTION } from "@/lib/aiServer";
import { data, filter, index } from "./helpers";

const FAKE_KEY = "TEST-KEY-DO-NOT-LEAK-123";
const payloadFor = (over: Parameters<typeof filter>[0] = {}, q = "점검 현장은?") =>
  buildAiPayload(data, index, filter(over), q);

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("AI에 보내는 자료", () => {
  it("9월 전체: 원문(raw)과 계산(computed)을 구분해 12행, 월별 요약 12개월", () => {
    const p = payloadFor();
    expect(p.selectedMonthRows).toHaveLength(12);
    expect(p.selectedMonthRows[0].raw.issueSummary).toBeTruthy();
    expect(p.selectedMonthRows[0].computed).toHaveProperty("progressGap");
    expect(p.monthlySummary).toHaveLength(12);
    expect(p.monthlyRecords).toBeUndefined();
    expect(p.scopeSummary).toMatchObject({
      earnedRate: 67.2,
      plannedProgress: 73.2,
      actualProgress: 71.2,
      progressGap: -2.0,
      monthlyEarned: 28878.7,
      counts: { 정상: 6, 주의: 3, 점검: 3 },
    });
    expect(p.note).toContain("원인 확정");
  });

  it("점검 순위는 프로그램이 계산해 전달: D(-10.7) → I(-7.6) → K(-5.4)", () => {
    expect(payloadFor().inspectionRanking.map((r) => `${r.rank}:${r.siteId}(${r.progressGap})`)).toEqual([
      "1:D(-10.7)",
      "2:I(-7.6)",
      "3:K(-5.4)",
    ]);
    expect(payloadFor({ region: "인천" }).inspectionRanking).toEqual([]);
  });

  it("전월 대비 공정차이 변화도 프로그램이 계산: D의 9월은 +0.5pp(차이 축소), 첫 달은 null", () => {
    const s = payloadFor({ siteId: "D" }).monthlySummary;
    const sep = s.find((m) => m.month === "2026-09")!;
    const aug = s.find((m) => m.month === "2026-08")!;
    expect(sep).toMatchObject({ progressGap: -10.7, progressGapChange: 0.5 });
    expect(aug).toMatchObject({ progressGap: -11.2, progressGapChange: 1.8 }); // 7월 -13.0 → 8월 -11.2
    expect(s[0]).toMatchObject({ month: "2025-10", progressGapChange: null });
  });

  it("월별 요약의 첫 달 당월기성액은 null(계산 불가)", () => {
    const first = payloadFor().monthlySummary[0];
    expect(first).toMatchObject({ month: "2025-10", empty: false, monthlyEarned: null });
  });

  it("현장 한 곳(D)을 고르면 그 현장의 월별 원문 기록 12개월을 함께 보냄(8월 -11.2 → 9월 -10.7)", () => {
    const p = payloadFor({ siteId: "D" });
    expect(p.monthlyRecords).toHaveLength(12);
    expect(p.monthlyRecords!.every((r) => r.raw.siteId === "D")).toBe(true);
    const gap = (m: string) => p.monthlyRecords!.find((r) => r.raw.month === m)!.computed.progressGap;
    expect(gap("2026-08")).toBe(-11.2);
    expect(gap("2026-09")).toBe(-10.7);
  });

  it("현장이 여러 곳이면 월별 원문 기록은 보내지 않음", () => {
    expect(payloadFor({ region: "경기" }).monthlyRecords).toBeUndefined();
  });

  it("범위 밖 현장·월은 포함하지 않음(인천·공동주택 7월)", () => {
    const p = payloadFor({ region: "인천", projectType: "공동주택", month: "2026-07" });
    expect(p.selectedMonthRows.map((r) => r.raw.siteId)).toEqual(["A", "G"]);
    expect(p.selectedMonthRows.every((r) => r.raw.month === "2026-07")).toBe(true);
    expect(p.monthlySummary).toHaveLength(10);
    expect(p.monthlySummary.every((m) => !m.empty && m.siteCount === 2)).toBe(true);
  });

  it("전달 자료에 API 키 관련 값이 없음", () => {
    const s = JSON.stringify(payloadFor({ siteId: "D" }));
    expect(s).not.toMatch(/api[_-]?key|GEMINI/i);
  });

  it("서버 검사: 빈 질문·긴 질문·형식 오류를 거부", () => {
    expect(checkAiPayload(payloadFor())).toBeNull();
    expect(checkAiPayload({ ...payloadFor(), question: "  " })).toContain("비어");
    expect(checkAiPayload({ ...payloadFor(), question: "가".repeat(MAX_QUESTION_LENGTH + 1) })).toContain("500자");
    expect(checkAiPayload(null)).not.toBeNull();
    expect(checkAiPayload({ question: "q" })).not.toBeNull();
  });
});

describe("지시문(시스템 지시)", () => {
  it("자료에 없는 내용·기록의 해석 제한·계약상 일정 구분을 담고 있음", () => {
    expect(SYSTEM_INSTRUCTION).toContain("자료에 없습니다");
    expect(SYSTEM_INSTRUCTION).toContain("실제 준공일");
    expect(SYSTEM_INSTRUCTION).toContain("contractEndDate");
    expect(SYSTEM_INSTRUCTION).toContain("기록된 상황");
    expect(SYSTEM_INSTRUCTION).toContain("계획된 대응");
    expect(SYSTEM_INSTRUCTION).toContain("직접 계산하거나 숫자를 고치지 않습니다");
  });
});

describe("Gemini 호출(가짜 응답)", () => {
  it("성공: 답변·근거 필드를 꺼내고, 요청에만 키를 쓰며 응답에는 키가 없음", async () => {
    const fetchMock = stubFetch(async () =>
      geminiOk(JSON.stringify({ answer: "D(-10.7pp) → I → K 순서입니다.", usedMonths: ["2026-09"], usedSites: ["D", "I", "K"], usedFields: ["plannedProgress", "actualProgress"] })),
    );
    const body = JSON.stringify(payloadFor());
    const r = await handleAsk(body, { GEMINI_API_KEY: FAKE_KEY });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, mock: false, usedSites: ["D", "I", "K"], usedMonths: ["2026-09"] });
    expect(JSON.stringify(r.body)).not.toContain(FAKE_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`/models/${GEMINI_MODEL}:generateContent`);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(FAKE_KEY);
    expect(String(init.body)).not.toContain(FAKE_KEY);
    const sent = JSON.parse(String(init.body));
    expect(sent.systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION);
    const user = sent.contents[0].parts[0].text as string;
    expect(user).toContain("점검 현장은?");
    expect(user).toContain("monthlySummary");
    expect(user).toContain("selectedMonthRows");
  });

  it("JSON이 아닌 답이면 글 전체를 답변으로 사용", async () => {
    stubFetch(async () => geminiOk("그냥 글입니다."));
    const r = await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY });
    expect(r.body).toMatchObject({ ok: true, answer: "그냥 글입니다.", usedFields: [] });
  });

  it.each([
    [429, "{}", "QUOTA", 429],
    [403, "{}", "KEY_INVALID", 502],
    [401, "{}", "KEY_INVALID", 502],
    [400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}', "KEY_INVALID", 502],
    [404, "{}", "MODEL", 502],
    [500, "{}", "UPSTREAM", 502],
  ])("HTTP %s → %s", async (status, text, code, httpStatus) => {
    stubFetch(async () => new Response(text, { status }));
    const r = await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY });
    expect(r.body).toMatchObject({ ok: false, code });
    expect(r.status).toBe(httpStatus);
    expect(JSON.stringify(r.body)).not.toContain(FAKE_KEY);
  });

  it("시간 초과 → TIMEOUT, 연결 실패 → CONNECTION", async () => {
    stubFetch(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    expect((await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY })).body).toMatchObject({ code: "TIMEOUT" });
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY })).body).toMatchObject({ code: "CONNECTION" });
  });

  it("API 키가 없으면 AI를 부르지 않고 NO_KEY", async () => {
    const f = stubFetch(async () => geminiOk("x"));
    const r = await handleAsk(JSON.stringify(payloadFor()), {});
    expect(r.body).toMatchObject({ ok: false, code: "NO_KEY" });
    expect(f).not.toHaveBeenCalled();
    const blank = await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: "  " });
    expect(blank.body).toMatchObject({ code: "NO_KEY" });
  });

  it("안전 차단·빈 응답 처리", async () => {
    stubFetch(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }));
    expect((await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY })).body).toMatchObject({ code: "BLOCKED" });
    stubFetch(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    expect((await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY })).body).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("잘못된 요청: JSON 아님·빈 질문·너무 큰 요청은 AI를 부르지 않고 거부", async () => {
    const f = stubFetch(async () => geminiOk("x"));
    expect((await handleAsk("not json", { GEMINI_API_KEY: FAKE_KEY })).status).toBe(400);
    expect((await handleAsk(JSON.stringify({ ...payloadFor(), question: "" }), { GEMINI_API_KEY: FAKE_KEY })).status).toBe(400);
    const huge = JSON.stringify({ ...payloadFor(), note: "x".repeat(200 * 1024) });
    expect((await handleAsk(huge, { GEMINI_API_KEY: FAKE_KEY })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("모의 응답 모드", () => {
  it("ok: 실제 AI를 부르지 않고 '모의 응답'으로 표시, 점검 순서는 계산 값 그대로", async () => {
    const f = stubFetch(async () => geminiOk("x"));
    const r = await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY, AI_MOCK: "ok" });
    expect(f).not.toHaveBeenCalled();
    expect(r.body).toMatchObject({ ok: true, mock: true });
    if (r.body.ok) expect(r.body.answer).toContain("D(-10.7pp) → I(-7.6pp) → K(-5.4pp)");
  });

  it.each([
    ["nokey", "NO_KEY"],
    ["quota", "QUOTA"],
    ["timeout", "TIMEOUT"],
    ["error", "UPSTREAM"],
    ["connection", "CONNECTION"],
  ])("%s → %s", async (mode, code) => {
    const r = await handleAsk(JSON.stringify(payloadFor()), { GEMINI_API_KEY: FAKE_KEY, AI_MOCK: mode });
    expect(r.body).toMatchObject({ ok: false, code });
  });
});

describe("응답 읽기", () => {
  it("```json 울타리가 있어도 읽음", () => {
    const p = parseAnswer('```json\n{"answer":"가","usedFields":["issueSummary"]}\n```');
    expect(p).toMatchObject({ answer: "가", usedFields: ["issueSummary"], usedSites: [] });
  });
  it("빈 글은 null", () => expect(parseAnswer("   ")).toBeNull());
  it("오류 분류", () => {
    expect(classifyHttpError(503, "")).toBe("UPSTREAM");
  });
});
