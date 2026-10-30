"use client";

import { useData } from "./DataProvider";
import { useScope } from "./useScope";
import { buildCsv, exportFileName } from "@/lib/export";

/** 지금 고른 월·지역·유형·현장과 같은 범위를 내려받습니다. */
export function ExportButton() {
  const { filter, index } = useData();
  const scope = useScope();
  const count = scope?.rows.length ?? 0;

  function download() {
    if (!scope || scope.rows.length === 0) return;
    const blob = new Blob([buildCsv(scope.rows, index)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(filter);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="toolbar">
      {count === 0 ? (
        <span className="muted" role="status" data-testid="export-note">
          내보낼 자료가 없습니다.
        </span>
      ) : (
        <span className="muted" data-testid="export-note">
          선택 월 {filter.month} · {count}행을 내보냅니다.
        </span>
      )}
      <button className="btn" onClick={download} disabled={count === 0} data-testid="export-button">
        CSV 내보내기
      </button>
    </div>
  );
}
