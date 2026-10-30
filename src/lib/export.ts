import { metricsForRows, RowIndex } from "./calc";
import { csvCell } from "./csv";
import { plain1 } from "./format";
import { ALL, DataRow, Filter, REQUIRED_FIELDS } from "./types";

/** 원본 15개 열 + 계산해서 더하는 4개 열 */
export const EXPORT_HEADERS = [...REQUIRED_FIELDS, "earnedRate", "progressGap", "status", "monthlyEarned"] as const;

/**
 * 지금 고른 범위의 행(선택 월)을 엑셀에서 한글이 깨지지 않는 CSV(UTF-8 BOM)로 만듭니다.
 * 원본 열은 값 그대로, 추가 열은 화면과 같이 소수 첫째 자리. 전월이 없으면 monthlyEarned 는 빈칸입니다.
 */
export function buildCsv(rows: DataRow[], index: RowIndex): string {
  const metrics = metricsForRows(rows, index);
  const lines = [EXPORT_HEADERS.join(",")];
  for (const m of metrics) {
    const r = m.row;
    lines.push(
      [
        ...REQUIRED_FIELDS.map((f) => csvCell(r[f])),
        plain1(m.earnedRate),
        plain1(m.gap),
        m.status,
        plain1(m.monthly),
      ].join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** 현장공정기성_2026-09.csv, 현장을 하나 고르면 현장공정기성_2026-09_D.csv */
export function exportFileName(f: Filter): string {
  return `현장공정기성_${f.month}${f.siteId === ALL ? "" : `_${f.siteId}`}.csv`;
}
