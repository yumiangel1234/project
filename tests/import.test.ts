import { describe, expect, it } from "vitest";
import { parseCsvText } from "@/lib/csv";
import { validateCsvText, validateImportFile, validateJsonText } from "@/lib/validate";
import { loadCsvRows, loadJsonRows, readData, readErrorFile } from "./helpers";

describe("정상 자료 가져오기", () => {
  it("CSV는 144행·12개 현장·2025-10~2026-09", () => {
    const r = validateCsvText(readData("현장공정기성.csv"));
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({
      format: "CSV",
      rowCount: 144,
      siteCount: 12,
      monthFirst: "2025-10",
      monthLast: "2026-09",
    });
    expect(r.warnings).toEqual([]);
    expect(r.notices[0]).toContain("백만원");
  });

  it("JSON도 144행", () => {
    const r = validateJsonText(readData("현장공정기성.json"));
    expect(r.ok).toBe(true);
    expect(r.summary?.rowCount).toBe(144);
    expect(r.summary?.format).toBe("JSON");
  });

  it("CSV 다음 JSON을 가져와도 144행이고 두 내용이 같다(누적 288행 금지)", () => {
    // 가져오기는 이어붙이지 않고 전체 교체이므로 결과는 새로 읽은 행 수와 같습니다.
    let current = loadCsvRows();
    expect(current).toHaveLength(144);
    current = loadJsonRows();
    expect(current).toHaveLength(144);
    expect(loadJsonRows()).toEqual(loadCsvRows());
  });

  it("BOM이 있어도 읽습니다", () => {
    const text = readData("현장공정기성.csv");
    expect(validateCsvText("﻿" + text.replace(/^﻿/, "")).ok).toBe(true);
  });
});

describe("오류 파일 3종은 거부", () => {
  it("공정률 101 → 134행 actualProgress 범위 오류", () => {
    const r = validateCsvText(readErrorFile("오류_공정률101.csv"));
    expect(r.ok).toBe(false);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ location: "134행", column: "actualProgress", value: "101" });
    expect(r.errors[0].message).toContain("0~100");
  });

  it("공정률 빈칸 → 134행 actualProgress 필수값 오류(0으로 바꾸지 않음)", () => {
    const r = validateCsvText(readErrorFile("오류_공정률빈값.csv"));
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ location: "134행", column: "actualProgress", value: "(빈칸)" });
    expect(r.errors[0].message).toContain("0으로 바꾸지 않습니다");
  });

  it("중복키 → 146행 2026-09 / D 중복", () => {
    const r = validateCsvText(readErrorFile("오류_중복키.csv"));
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ location: "146행", column: "month + siteId", value: "2026-09 / D" });
  });
});

describe("그 밖의 오류", () => {
  const good = readData("현장공정기성.csv").replace(/^﻿/, "");
  const lines = good.split(/\r?\n/);
  const replaceCol = (lineNo: number, col: number, value: string) => {
    const copy = [...lines];
    const cells = copy[lineNo - 1].split(",");
    cells[col] = value;
    copy[lineNo - 1] = cells.join(",");
    return copy.join("\n");
  };

  it("계약금액 0은 거부", () => {
    const r = validateCsvText(replaceCol(134, 3, "0"));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.column === "contractAmount" && e.message.includes("0보다"))).toBe(true);
  });

  it("열이 빠지면 거부", () => {
    const r = validateCsvText(good.replace("actionPlan", "x"));
    expect(r.ok).toBe(false);
    expect(r.errors[0].column).toContain("actionPlan");
  });

  it("누적기성액이 줄면 거부", () => {
    // 2026-09/A 의 누적기성액을 2026-08 값보다 작게
    const r = validateCsvText(replaceCol(134, 6, "1000"));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.column === "cumulativeEarned")).toBe(true);
  });

  it("같은 현장의 계약금액이 달라지면 거부", () => {
    const r = validateCsvText(replaceCol(134, 3, "86401"));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.column === "contractAmount" && e.message.includes("다른 월"))).toBe(true);
  });

  it("날짜 형식 오류", () => {
    const r = validateCsvText(replaceCol(30, 9, "2024/11/01"));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.column === "startDate")).toBe(true);
  });

  it("JSON 메타데이터 단위가 다르면 거부", () => {
    const obj = JSON.parse(readData("현장공정기성.json"));
    obj.metadata.moneyUnit = "원";
    const r = validateJsonText(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    expect(r.errors[0].column).toBe("moneyUnit");
  });

  it("JSON이 깨졌으면 거부", () => {
    expect(validateJsonText("{ not json").ok).toBe(false);
  });

  it("CSV·JSON이 아닌 파일, 빈 파일은 거부", () => {
    expect(validateImportFile("a.txt", 10, "abc").ok).toBe(false);
    expect(validateImportFile("a.csv", 0, "").ok).toBe(false);
  });

  it("월별 누락은 오류가 아니라 경고", () => {
    const withoutMarch = [lines[0], ...lines.slice(1).filter((l) => !l.startsWith("2026-03,A,"))].join("\n");
    const r = validateCsvText(withoutMarch);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(143);
    expect(r.warnings.join(" ")).toContain("현장 A: 2026-03");
  });

  it("15개 외 열은 경고하고 무시", () => {
    const [head, ...rest] = lines;
    const extra = [head + ",memo", ...rest.filter(Boolean).map((l) => l + ",x")].join("\n");
    const r = validateCsvText(extra);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain("memo");
  });
});

describe("CSV 읽기", () => {
  it("따옴표 안의 쉼표·줄바꿈·큰따옴표를 처리하고 줄 번호를 센다", () => {
    const t = parseCsvText('a,b\n"x,1","y\nz"\n"q""r",2\n');
    expect(t.rows).toEqual([
      ["a", "b"],
      ["x,1", "y\nz"],
      ['q"r', "2"],
    ]);
    expect(t.lines).toEqual([1, 2, 4]);
  });
});
