"use client";

import Link from "next/link";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { ValidationResult } from "@/lib/types";
import { validateImportFile } from "@/lib/validate";

type Step =
  | { kind: "select"; message?: string }
  | { kind: "preview"; fileName: string; result: ValidationResult }
  | { kind: "error"; fileName: string; result: ValidationResult }
  | { kind: "done"; rowCount: number; siteCount: number };

const MAX_ERRORS_SHOWN = 20;
const PREVIEW_ROWS = 10;

export default function ImportPage() {
  const { meta, replaceData } = useData();
  const [step, setStep] = useState<Step>({ kind: "select" });
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const result = validateImportFile(file.name, file.size, text);
      setStep(result.ok ? { kind: "preview", fileName: file.name, result } : { kind: "error", fileName: file.name, result });
    } catch {
      setStep({
        kind: "error",
        fileName: file.name,
        result: {
          ok: false,
          errors: [{ location: "파일", column: "파일", value: "", message: "파일을 읽지 못했습니다." }],
          warnings: [],
          notices: [],
          rows: [],
          summary: null,
        },
      });
    } finally {
      setBusy(false);
    }
  }

  function reset(message?: string) {
    setInputKey((k) => k + 1); // 같은 파일을 다시 고를 수 있게 입력을 비웁니다.
    setStep({ kind: "select", message });
  }

  function confirm(fileName: string, result: ValidationResult) {
    if (!result.summary) return;
    replaceData(result.rows, {
      fileName,
      format: result.summary.format,
      rowCount: result.summary.rowCount,
      siteCount: result.summary.siteCount,
    });
    setInputKey((k) => k + 1);
    setStep({ kind: "done", rowCount: result.summary.rowCount, siteCount: result.summary.siteCount });
  }

  return (
    <main className="page">
      <h1>자료 가져오기</h1>
      <p className="muted" data-testid="import-current">
        {meta
          ? `지금 자료: ${meta.rowCount}행 · ${meta.siteCount}개 현장 (${meta.fileName}, ${meta.format})`
          : "지금 자료: 없음"}
      </p>

      {(step.kind === "select" || busy) && (
        <section className="card">
          <h2>1. 파일 고르기</h2>
          <p>CSV 또는 JSON 파일 하나를 고릅니다. 검사와 미리보기를 거친 뒤 지금 자료를 전체 교체합니다(이어붙이지 않습니다).</p>
          <input
            key={inputKey}
            id="import-file"
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={busy}
            aria-label="가져올 CSV 또는 JSON 파일"
          />
          {busy && <p role="status">검사 중…</p>}
          {step.kind === "select" && step.message && (
            <p className="notice" role="status" data-testid="import-message">
              {step.message}
            </p>
          )}
        </section>
      )}

      {step.kind === "error" && (
        <section className="card error-card" data-testid="import-error">
          <h2>가져오기 오류 — 반영하지 않았습니다</h2>
          <p>
            <strong>{step.fileName}</strong> 파일에서 {step.result.errors.length}건의 문제를 찾았습니다.{" "}
            <strong data-testid="keep-note">지금 자료는 그대로 유지됩니다.</strong>
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>위치</th>
                <th>열</th>
                <th>값</th>
                <th>이유</th>
              </tr>
            </thead>
            <tbody>
              {step.result.errors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
                <tr key={i}>
                  <td>{e.location}</td>
                  <td>{e.column}</td>
                  <td>{e.value}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {step.result.errors.length > MAX_ERRORS_SHOWN && (
            <p>외 {step.result.errors.length - MAX_ERRORS_SHOWN}건</p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => reset("지금 자료는 그대로입니다.")}>
              다른 파일 고르기
            </button>
          </div>
        </section>
      )}

      {step.kind === "preview" && step.result.summary && (
        <section className="card" data-testid="import-preview">
          <h2>2. 미리보기 — 검사를 통과했습니다</h2>
          <dl className="summary-line">
            <div>
              <dt>파일</dt>
              <dd>
                {step.fileName} ({step.result.summary.format})
              </dd>
            </div>
            <div>
              <dt>행 수</dt>
              <dd data-testid="preview-rows">{step.result.summary.rowCount}행</dd>
            </div>
            <div>
              <dt>현장 수</dt>
              <dd data-testid="preview-sites">{step.result.summary.siteCount}개 현장</dd>
            </div>
            <div>
              <dt>월 범위</dt>
              <dd>
                {step.result.summary.monthFirst} ~ {step.result.summary.monthLast}
              </dd>
            </div>
          </dl>
          {step.result.notices.map((n) => (
            <p key={n} className="notice">
              {n}
            </p>
          ))}
          {step.result.warnings.map((w) => (
            <p key={w} className="warn" role="alert">
              경고: {w}
            </p>
          ))}
          <p className="muted">처음 {PREVIEW_ROWS}행</p>
          <div className="table-scroll">
            <table className="table compact">
              <thead>
                <tr>
                  <th>month</th>
                  <th>siteId</th>
                  <th>siteName</th>
                  <th>contractAmount</th>
                  <th>plannedProgress</th>
                  <th>actualProgress</th>
                  <th>cumulativeEarned</th>
                  <th>region</th>
                  <th>projectType</th>
                </tr>
              </thead>
              <tbody>
                {step.result.rows.slice(0, PREVIEW_ROWS).map((r) => (
                  <tr key={`${r.month}|${r.siteId}`}>
                    <td>{r.month}</td>
                    <td>{r.siteId}</td>
                    <td>{r.siteName}</td>
                    <td>{r.contractAmount}</td>
                    <td>{r.plannedProgress}</td>
                    <td>{r.actualProgress}</td>
                    <td>{r.cumulativeEarned}</td>
                    <td>{r.region}</td>
                    <td>{r.projectType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => confirm(step.fileName, step.result)}>
              가져오기
            </button>
            <button className="btn" onClick={() => reset("가져오기를 취소했습니다. 지금 자료는 그대로입니다.")}>
              취소
            </button>
          </div>
        </section>
      )}

      {step.kind === "done" && (
        <section className="card" data-testid="import-done">
          <h2>3. 완료</h2>
          <p data-testid="done-message">
            {step.rowCount}행으로 교체했습니다. ({step.siteCount}개 현장)
          </p>
          <div className="actions">
            <Link href="/" className="btn primary">
              현황 보기
            </Link>
            <button className="btn" onClick={() => reset()}>
              다른 파일 가져오기
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
