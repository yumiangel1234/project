import {
  AI_TIMEOUT_MS,
  AiErrorCode,
  AiPayload,
  AiResponse,
  checkAiPayload,
  MAX_BODY_BYTES,
} from "./ai";

export const GEMINI_MODEL = "gemini-3.8-flash";

export const SYSTEM_INSTRUCTION = [
  "당신은 건설 현장의 공정·기성 현황을 설명하는 도우미입니다. 아래 규칙을 반드시 지킵니다.",
  "1. 사용자 메시지의 JSON에 있는 숫자만 근거로 설명합니다. 직접 계산하거나 숫자를 고치지 않습니다.",
  '2. raw의 issueSummary는 "기록된 상황", actionPlan은 "계획된 대응"으로만 설명합니다. 원인을 확정하거나 대응이 완료되었다, 효과가 있었다고 말하지 않습니다.',
  '3. 자료에 없는 내용(실제 준공일, 수금액·미수금, 기상 실측, 향후 일정 예측)은 "자료에 없습니다"라고 답합니다. contractEndDate는 계약상 일정이며 실제 완료일이 아님을 구분해 말합니다.',
  "4. scope 밖의 월·현장을 물으면 전달된 자료 범위를 안내하고 숫자나 원인을 만들지 않습니다.",
  "5. monthlyRecords가 없으면 과거 월의 상황·원인은 설명할 수 없다고 말합니다. monthlySummary로는 숫자의 추이만 설명합니다.",
  "6. 이 자료는 교육용 가상 자료입니다. 실제 회사의 현장으로 소개하지 않습니다.",
  "7. 한국어로 간결하게 답합니다. 답변에는 기준 월과 현장 ID를 함께 적습니다.",
  "8. 점검 현장이나 순위를 묻는 질문에는 inspectionRanking(프로그램이 계산한 순서)을 그대로 따르고, 현장 ID마다 공정차이를 pp 단위로 함께 적습니다. 점검 현장이 없으면 없다고 답합니다.",
  "9. 추이·회복 질문에는 monthlySummary(현장 한 곳이면 monthlyRecords)의 progressGap과 progressGapChange를 인용해 월별 값과 전월 대비 변화(pp)를 적습니다. progressGapChange가 양수면 차이가 줄어든 것, 음수면 커진 것입니다. 지금 상태(정상·주의·점검)도 함께 말합니다.",
  "10. 공정차이의 단위는 pp로 씁니다(%p로 쓰지 않습니다).",
  '출력은 JSON 객체 하나만 씁니다: {"answer": 문자열, "usedMonths": 문자열 배열, "usedSites": 문자열 배열, "usedFields": 문자열 배열}',
  "usedMonths에는 답변에 쓴 기준 월, usedSites에는 답변에 쓴 현장 ID, usedFields에는 답변에 참고한 필드 이름(예: issueSummary, actionPlan, plannedProgress, monthlySummary)을 적습니다.",
].join("\n");

const MESSAGES: Record<AiErrorCode, string> = {
  BAD_REQUEST: "요청 내용이 올바르지 않습니다.",
  NO_KEY: "AI 연결 설정(API 키)이 없습니다. .env.local 파일의 GEMINI_API_KEY를 확인해 주세요.",
  KEY_INVALID: "API 키가 올바르지 않거나 사용 권한이 없습니다. 키를 확인해 주세요.",
  QUOTA: "AI 사용 한도를 넘었습니다. 잠시 뒤에 다시 시도해 주세요.",
  TIMEOUT: "AI 응답이 제한 시간(20초) 안에 오지 않았습니다.",
  CONNECTION: "AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.",
  MODEL: `AI 모델(${GEMINI_MODEL})을 사용할 수 없습니다.`,
  BLOCKED: "AI가 이 질문에는 답하지 못했습니다. 질문을 바꿔 보세요.",
  UPSTREAM: "AI 서비스에서 오류가 났습니다. 잠시 뒤에 다시 시도해 주세요.",
  BAD_RESPONSE: "AI 응답을 읽지 못했습니다. 다시 시도해 주세요.",
};

const STATUS: Record<AiErrorCode, number> = {
  BAD_REQUEST: 400,
  NO_KEY: 503,
  KEY_INVALID: 502,
  QUOTA: 429,
  TIMEOUT: 504,
  CONNECTION: 502,
  MODEL: 502,
  BLOCKED: 502,
  UPSTREAM: 502,
  BAD_RESPONSE: 502,
};

export type HandlerResult = { status: number; body: AiResponse };

function fail(code: AiErrorCode, message?: string): HandlerResult {
  return { status: STATUS[code], body: { ok: false, code, message: message ?? MESSAGES[code] } };
}

/** HTTP 상태와 응답 내용으로 오류 종류를 가릅니다. 키 값은 어디에도 싣지 않습니다. */
export function classifyHttpError(status: number, bodyText: string): AiErrorCode {
  if (status === 429) return "QUOTA";
  if (status === 401 || status === 403) return "KEY_INVALID";
  if (status === 404) return "MODEL";
  if (status === 400) return /api key|API_KEY|key not valid/i.test(bodyText) ? "KEY_INVALID" : "UPSTREAM";
  return "UPSTREAM";
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Gemini가 돌려준 글에서 답변·근거를 꺼냅니다. JSON이 아니면 글 전체를 답변으로 씁니다. */
export function parseAnswer(text: string): { answer: string; usedMonths: string[]; usedSites: string[]; usedFields: string[] } | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const j = JSON.parse(stripFence(t));
    if (j && typeof j === "object" && typeof j.answer === "string" && j.answer.trim()) {
      return {
        answer: j.answer.trim(),
        usedMonths: strArr(j.usedMonths),
        usedSites: strArr(j.usedSites),
        usedFields: strArr(j.usedFields),
      };
    }
  } catch {
    // JSON이 아닌 글이면 아래에서 그대로 답변으로 씁니다.
  }
  return { answer: t, usedMonths: [], usedSites: [], usedFields: [] };
}

function userMessage(payload: AiPayload): string {
  const { question, ...data } = payload;
  return `질문: ${question}\n\n자료(JSON):\n${JSON.stringify(data)}`;
}

/** 실제 AI 없이 화면 동작을 확인하는 모의 응답. 숫자는 전달받은 계산 값만 씁니다. */
function mockAnswer(payload: AiPayload): AiResponse {
  const checks = payload.selectedMonthRows
    .filter((r) => r.computed.status === "점검")
    .sort((a, b) => a.computed.progressGap - b.computed.progressGap || a.raw.siteId.localeCompare(b.raw.siteId));
  const list = checks.map((r) => `${r.raw.siteId}(${r.computed.progressGap}pp)`).join(" → ") || "없음";
  return {
    ok: true,
    mock: true,
    answer: `모의 응답입니다. ${payload.scope.month} 범위에서 점검 현장은 ${list}입니다.`,
    usedMonths: [payload.scope.month],
    usedSites: checks.map((r) => r.raw.siteId),
    usedFields: ["plannedProgress", "actualProgress"],
  };
}

type Env = { GEMINI_API_KEY?: string; AI_MOCK?: string };

/** /api/ask 의 실제 처리. 키는 서버 환경 변수에서만 읽고 응답·로그에 남기지 않습니다. */
export async function handleAsk(bodyText: string, env: Env): Promise<HandlerResult> {
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return fail("BAD_REQUEST", "전달 자료가 너무 큽니다.");
  }
  let payload: AiPayload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return fail("BAD_REQUEST");
  }
  const problem = checkAiPayload(payload);
  if (problem) return fail("BAD_REQUEST", problem);

  // 모의 모드: 실제 AI를 부르지 않고 화면·오류 동작만 확인합니다.
  const mock = env.AI_MOCK?.trim();
  if (mock) {
    if (mock === "ok") return { status: 200, body: mockAnswer(payload) };
    const map: Record<string, AiErrorCode> = {
      nokey: "NO_KEY",
      quota: "QUOTA",
      timeout: "TIMEOUT",
      error: "UPSTREAM",
      connection: "CONNECTION",
    };
    return fail(map[mock] ?? "UPSTREAM");
  }

  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return fail("NO_KEY");

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: userMessage(payload) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return fail(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "CONNECTION");
  }

  if (!res.ok) {
    const code = classifyHttpError(res.status, await res.text().catch(() => ""));
    console.error(`[ask] Gemini 요청 실패: HTTP ${res.status} → ${code}`);
    return fail(code);
  }

  let json: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    json = await res.json();
  } catch {
    return fail("BAD_RESPONSE");
  }
  if (json.promptFeedback?.blockReason) return fail("BLOCKED");
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const parsed = parseAnswer(text);
  if (!parsed) return fail("BAD_RESPONSE");
  return { status: 200, body: { ok: true, mock: false, ...parsed } };
}
