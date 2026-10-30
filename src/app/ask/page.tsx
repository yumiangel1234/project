"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FilterBar, scopeLabel } from "@/components/FilterBar";
import { useData } from "@/components/DataProvider";
import { NoData } from "@/components/NoData";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AI_TIMEOUT_MS,
  AiPayload,
  AiResponse,
  buildAiPayload,
  EXAMPLE_QUESTIONS,
  MAX_QUESTION_LENGTH,
} from "@/lib/ai";
import { fmtMoney, fmtPct, fmtPp } from "@/lib/format";

type View =
  | { kind: "idle" }
  | { kind: "loading"; question: string }
  | { kind: "answer"; question: string; payload: AiPayload; res: Extract<AiResponse, { ok: true }> }
  | { kind: "error"; question: string; message: string };

export default function AskPage() {
  const { data, index, filter } = useData();
  const [question, setQuestion] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });
  const requestId = useRef(0);
  const scopeKey = JSON.stringify(filter);

  // 월·지역·유형·현장이 바뀌면 이전 답변을 지우고, 기다리는 중이던 요청의 늦은 응답도 버립니다.
  useEffect(() => {
    requestId.current += 1;
    setView({ kind: "idle" });
  }, [scopeKey]);

  if (!data) {
    return (
      <main className="page">
        <h1>AI에게 묻기</h1>
        <NoData />
      </main>
    );
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || !data) return;
    const id = ++requestId.current;
    const payload = buildAiPayload(data, index, filter, text);
    setView({ kind: "loading", question: text });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS + 5000),
      });
      const json = (await res.json()) as AiResponse;
      if (id !== requestId.current) return; // 그 사이 범위가 바뀌었으면 표시하지 않음
      if (json.ok) setView({ kind: "answer", question: text, payload, res: json });
      else setView({ kind: "error", question: text, message: json.message });
    } catch (e) {
      if (id !== requestId.current) return;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      setView({
        kind: "error",
        question: text,
        message: timedOut ? "AI 응답이 제한 시간 안에 오지 않았습니다." : "AI 서버에 연결하지 못했습니다.",
      });
    }
  }

  const loading = view.kind === "loading";

  return (
    <main className="page">
      <h1>AI에게 묻기</h1>
      <FilterBar />
      <section className="card">
        <h2>질문하기</h2>
        <p className="muted">
          숫자는 프로그램이 계산하고, AI는 그 숫자와 기록된 상황·대응 계획을 근거로 설명합니다. 자료에 없는 내용은 알 수 없다고 답합니다.
        </p>
        <p data-testid="ask-scope">
          <strong>지금 범위:</strong> {scopeLabel(filter)}
        </p>
        <div className="examples" aria-label="예시 질문">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              className="btn"
              disabled={loading}
              onClick={() => {
                setQuestion(q);
                ask(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <textarea
            id="ask-input"
            value={question}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="궁금한 내용을 입력하세요 (최대 500자)"
            aria-label="질문 입력"
          />
          <div className="actions">
            <button type="submit" className="btn primary" disabled={loading || question.trim() === ""}>
              묻기
            </button>
            <span className="muted">
              {question.length}/{MAX_QUESTION_LENGTH}
            </span>
          </div>
        </form>
      </section>

      {view.kind === "loading" && (
        <section className="state-box" role="status" data-testid="ai-loading">
          <h2>AI 답변 기다리는 중…</h2>
          <p>질문: {view.question}</p>
        </section>
      )}

      {view.kind === "error" && (
        <section className="state-box error-card" role="alert" data-testid="ai-error">
          <h2>AI 연결 실패</h2>
          <p data-testid="ai-error-message">{view.message}</p>
          <p>
            <strong>대시보드와 CSV 내보내기는 계속 쓸 수 있습니다.</strong>{" "}
            <Link href="/">현황 요약으로 가기</Link>
          </p>
        </section>
      )}

      {view.kind === "answer" && <Answer view={view} />}
    </main>
  );
}

function Answer({ view }: { view: Extract<View, { kind: "answer" }> }) {
  const { payload, res } = view;
  const { scope } = payload;
  const siteList = res.usedSites.length > 0 ? res.usedSites.join(", ") : "—";
  return (
    <section className="card" data-testid="ai-answer">
      <h2>
        답변{res.mock && <span className="mock-badge" data-testid="mock-badge">모의 응답</span>}
      </h2>
      <p className="muted">질문: {view.question}</p>
      <p className="answer" data-testid="ai-answer-text">
        {res.answer}
      </p>

      <h3>근거</h3>
      <dl className="detail-grid">
        <dt>기준 월</dt>
        <dd data-testid="basis-month">
          {scope.month} (선택 월){res.usedMonths.length > 0 && ` · AI가 사용한 월: ${res.usedMonths.join(", ")}`}
        </dd>
        <dt>범위·현장</dt>
        <dd data-testid="basis-sites">
          {scopeLabel({ month: scope.month, region: scope.region, projectType: scope.projectType, siteId: scope.siteId })} · AI가 언급한 현장: {siteList}
        </dd>
        <dt>참고한 기록 필드</dt>
        <dd data-testid="basis-fields">
          {res.usedFields.length > 0 ? (
            <span className="chips">
              {res.usedFields.map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </span>
          ) : (
            "—"
          )}
        </dd>
      </dl>

      <h3>근거 숫자 (프로그램이 계산해 전달한 값, {scope.month})</h3>
      <div className="table-scroll">
        <table className="table compact" data-testid="basis-table">
          <thead>
            <tr>
              <th>현장</th>
              <th className="num">계획</th>
              <th className="num">실제</th>
              <th className="num">공정차이</th>
              <th className="num">기성률</th>
              <th className="num">당월기성액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {payload.selectedMonthRows.map((r) => (
              <tr key={r.raw.siteId}>
                <td>
                  {r.raw.siteId} {r.raw.siteName.replace("[가상] ", "")}
                </td>
                <td className="num">{fmtPct(r.raw.plannedProgress)}</td>
                <td className="num">{fmtPct(r.raw.actualProgress)}</td>
                <td className="num">{fmtPp(r.computed.progressGap)}</td>
                <td className="num">{fmtPct(r.computed.earnedRate)}</td>
                <td className="num">{fmtMoney(r.computed.monthlyEarned)}</td>
                <td>
                  <StatusBadge status={r.computed.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        범위 전체: 기성률 {fmtPct(payload.scopeSummary.earnedRate)} · 계획 {fmtPct(payload.scopeSummary.plannedProgress)} · 실제{" "}
        {fmtPct(payload.scopeSummary.actualProgress)} · 공정차이 {fmtPp(payload.scopeSummary.progressGap)}
      </p>

      <details>
        <summary>월별 요약 (시작 월~{scope.month}, 같은 범위)</summary>
        <table className="table compact">
          <thead>
            <tr>
              <th>월</th>
              <th className="num">기성률</th>
              <th className="num">계획</th>
              <th className="num">실제</th>
              <th className="num">공정차이</th>
              <th className="num">당월기성액</th>
            </tr>
          </thead>
          <tbody>
            {payload.monthlySummary.map((m) =>
              m.empty ? (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td colSpan={5}>자료 없음</td>
                </tr>
              ) : (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td className="num">{fmtPct(m.earnedRate)}</td>
                  <td className="num">{fmtPct(m.plannedProgress)}</td>
                  <td className="num">{fmtPct(m.actualProgress)}</td>
                  <td className="num">{fmtPp(m.progressGap)}</td>
                  <td className="num">{fmtMoney(m.monthlyEarned)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </details>
    </section>
  );
}
