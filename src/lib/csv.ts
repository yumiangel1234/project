export type CsvTable = {
  rows: string[][];
  /** rows[i]가 시작하는 파일의 줄 번호(1부터). 따옴표 안의 줄바꿈도 세어 줍니다. */
  lines: number[];
};

/** 따옴표·쉼표·줄바꿈·BOM을 처리하는 CSV 읽기. 모든 값을 문자열로 돌려줍니다. */
export function parseCsvText(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;

  const pushRow = () => {
    row.push(field);
    field = "";
    const blank = row.length === 1 && row[0].trim() === "";
    if (!blank) {
      rows.push(row);
      lines.push(rowStart);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // \r\n 의 \r 은 건너뜁니다.
    } else if (c === "\n") {
      pushRow();
      line++;
      rowStart = line;
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return { rows, lines };
}

/** 쉼표·따옴표·줄바꿈이 들어 있으면 큰따옴표로 감쌉니다. */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
