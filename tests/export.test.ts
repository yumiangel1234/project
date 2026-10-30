import { describe, expect, it } from "vitest";
import { scopeRows } from "@/lib/calc";
import { csvCell, parseCsvText } from "@/lib/csv";
import { buildCsv, EXPORT_HEADERS, exportFileName } from "@/lib/export";
import { REQUIRED_FIELDS } from "@/lib/types";
import { validateCsvText } from "@/lib/validate";
import { data, filter, index } from "./helpers";

function exportScope(over: Parameters<typeof filter>[0]) {
  const f = filter(over);
  const text = buildCsv(scopeRows(data, f), index);
  const table = parseCsvText(text);
  const header = table.rows[0];
  const records = table.rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  return { text, header, records, f };
}

describe("CSV 내보내기", () => {
  it("열은 원본 15개 + 계산 4개 = 19개", () => {
    const { header } = exportScope({});
    expect(header).toEqual([...REQUIRED_FIELDS, "earnedRate", "progressGap", "status", "monthlyEarned"]);
    expect(EXPORT_HEADERS).toHaveLength(19);
  });

  it("엑셀에서 한글이 깨지지 않도록 UTF-8 BOM으로 시작", () => {
    expect(exportScope({}).text.charCodeAt(0)).toBe(0xfeff);
  });

  it("9월 전체는 데이터 12행", () => {
    expect(exportScope({}).records).toHaveLength(12);
  });

  it("9월 D만 고르면 데이터 1행 — 기성률 69.4·공정차이 -10.7·점검·당월기성액 3339.6", () => {
    const { records, f } = exportScope({ siteId: "D" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      month: "2026-09",
      siteId: "D",
      earnedRate: "69.4",
      progressGap: "-10.7",
      status: "점검",
      monthlyEarned: "3339.6",
    });
    expect(exportFileName(f)).toBe("현장공정기성_2026-09_D.csv");
  });

  it("9월 인천·공동주택은 A·G 2행", () => {
    const { records } = exportScope({ region: "인천", projectType: "공동주택" });
    expect(records.map((r) => r.siteId)).toEqual(["A", "G"]);
  });

  it("2025-10은 당월기성액이 빈칸(0이나 누적액이 아님)", () => {
    const { records } = exportScope({ month: "2025-10" });
    expect(records).toHaveLength(12);
    expect(records.every((r) => r.monthlyEarned === "")).toBe(true);
  });

  it("J의 7월 당월기성액은 빈칸이 아니라 0.0", () => {
    const { records } = exportScope({ month: "2026-07", siteId: "J" });
    expect(records[0].monthlyEarned).toBe("0.0");
  });

  it("원본 열은 값 그대로 — 내보낸 파일을 다시 가져오면 같은 행(추가 열은 경고만)", () => {
    const { text } = exportScope({});
    const back = validateCsvText(text);
    expect(back.ok).toBe(true);
    expect(back.warnings.join(" ")).toContain("earnedRate");
    expect(back.rows).toEqual(scopeRows(data, filter()));
  });

  it("선택 범위에 행이 없으면 헤더만(화면에서는 버튼을 막음)", () => {
    const { records } = exportScope({ region: "대전", projectType: "공동주택" });
    expect(records).toHaveLength(0);
  });

  it("쉼표·따옴표·줄바꿈은 큰따옴표로 감쌈", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
    expect(csvCell(86400)).toBe("86400");
  });
});
