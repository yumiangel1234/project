import { parseCsvText } from "./csv";
import {
  DataRow,
  ImportIssue,
  MONTH_MAX,
  MONTH_MIN,
  PROJECT_TYPES,
  REGIONS,
  REQUIRED_FIELDS,
  ValidationResult,
} from "./types";

type Rec = Record<string, unknown>;
type Located = { rec: Rec; location: string };

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SITE_CONSTANT_FIELDS = [
  "siteName",
  "region",
  "projectType",
  "contractAmount",
  "startDate",
  "contractEndDate",
] as const;

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function show(v: unknown): string {
  if (v === undefined) return "(누락)";
  if (isBlank(v)) return "(빈칸)";
  return String(v);
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fileError(message: string, column = "파일"): ValidationResult {
  return {
    ok: false,
    errors: [{ location: "파일", column, value: "", message }],
    warnings: [],
    notices: [],
    rows: [],
    summary: null,
  };
}

/** 한 행의 15개 값을 검사해 DataRow 로 바꿉니다. 오류가 있으면 null. */
function checkRecord(rec: Rec, location: string, errors: ImportIssue[]): DataRow | null {
  const before = errors.length;
  const push = (column: string, value: unknown, message: string) =>
    errors.push({ location, column, value: show(value), message });

  const text = (f: string): string => {
    const v = rec[f];
    if (isBlank(v)) {
      push(
        f,
        v,
        v === undefined
          ? "필수 항목이 없습니다."
          : "필수값이 비어 있습니다. 빈칸을 0으로 바꾸지 않습니다.",
      );
      return "";
    }
    return String(v).trim();
  };

  const num = (f: string): number => {
    const v = rec[f];
    if (isBlank(v)) {
      push(
        f,
        v,
        v === undefined
          ? "필수 항목이 없습니다."
          : "필수값이 비어 있습니다. 빈칸을 0으로 바꾸지 않습니다.",
      );
      return NaN;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        push(f, v, "유한한 숫자가 아닙니다.");
        return NaN;
      }
      return v;
    }
    const s = String(v).trim();
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) {
      push(f, v, "숫자가 아닙니다.");
      return NaN;
    }
    return Number(s);
  };

  const month = text("month");
  const siteId = text("siteId");
  const siteName = text("siteName");
  const region = text("region");
  const projectType = text("projectType");
  const startDate = text("startDate");
  const contractEndDate = text("contractEndDate");
  const currentWork = text("currentWork");
  const issueCategory = text("issueCategory");
  const issueSummary = text("issueSummary");
  const actionPlan = text("actionPlan");
  const contractAmount = num("contractAmount");
  const plannedProgress = num("plannedProgress");
  const actualProgress = num("actualProgress");
  const cumulativeEarned = num("cumulativeEarned");

  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      push("month", month, "월은 YYYY-MM 형식이어야 합니다.");
    } else if (month < MONTH_MIN || month > MONTH_MAX) {
      push("month", month, `월은 ${MONTH_MIN}~${MONTH_MAX} 범위여야 합니다.`);
    }
  }
  if (siteId && !/^[A-L]$/.test(siteId)) {
    push("siteId", siteId, "현장 ID는 A~L 중 한 글자여야 합니다.");
  }
  if (siteName && !siteName.includes("[가상]")) {
    push("siteName", siteName, "교육용 가상 현장명에는 [가상] 표시가 있어야 합니다.");
  }
  if (region && !REGIONS.includes(region)) {
    push("region", region, `지역은 ${REGIONS.join("·")} 중 하나여야 합니다.`);
  }
  if (projectType && !PROJECT_TYPES.includes(projectType)) {
    push("projectType", projectType, `공사 유형은 ${PROJECT_TYPES.join("·")} 중 하나여야 합니다.`);
  }
  if (Number.isFinite(contractAmount) && contractAmount <= 0) {
    push("contractAmount", contractAmount, "계약금액은 0보다 커야 합니다.");
  }
  for (const [f, v] of [
    ["plannedProgress", plannedProgress],
    ["actualProgress", actualProgress],
  ] as const) {
    if (Number.isFinite(v) && (v < 0 || v > 100)) {
      push(f, v, "공정률은 0~100 범위여야 합니다.");
    }
  }
  if (Number.isFinite(cumulativeEarned)) {
    if (cumulativeEarned < 0) {
      push("cumulativeEarned", cumulativeEarned, "누적기성액은 0 이상이어야 합니다.");
    } else if (Number.isFinite(contractAmount) && cumulativeEarned > contractAmount) {
      push("cumulativeEarned", cumulativeEarned, "누적기성액이 계약금액보다 큽니다.");
    }
  }
  let startOk = false;
  let endOk = false;
  if (startDate) {
    if (isValidDate(startDate)) startOk = true;
    else push("startDate", startDate, "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.");
  }
  if (contractEndDate) {
    if (isValidDate(contractEndDate)) endOk = true;
    else push("contractEndDate", contractEndDate, "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.");
  }
  if (startOk && endOk && startDate >= contractEndDate) {
    push("contractEndDate", contractEndDate, "계약상 준공일은 착공일보다 늦어야 합니다.");
  }
  if (startOk && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && monthEnd(month) < startDate) {
    push("startDate", startDate, "월말 기준일이 착공일보다 이릅니다(착공 전 자료).");
  }

  if (errors.length > before) return null;
  return {
    month,
    siteId,
    siteName,
    contractAmount,
    plannedProgress,
    actualProgress,
    cumulativeEarned,
    region,
    projectType,
    startDate,
    contractEndDate,
    currentWork,
    issueCategory,
    issueSummary,
    actionPlan,
  };
}

function validateRecords(
  items: Located[],
  format: "CSV" | "JSON",
  extraWarnings: string[],
): ValidationResult {
  const errors: ImportIssue[] = [];
  const rows: DataRow[] = [];
  const locationOf = new Map<DataRow, string>();

  for (const { rec, location } of items) {
    const row = checkRecord(rec, location, errors);
    if (row) {
      rows.push(row);
      locationOf.set(row, location);
    }
  }

  // 같은 월 + 현장 중복
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.month}|${r.siteId}`;
    const first = seen.get(key);
    if (first) {
      errors.push({
        location: locationOf.get(r)!,
        column: "month + siteId",
        value: `${r.month} / ${r.siteId}`,
        message: `같은 월·현장이 중복되었습니다(${first}과 같음).`,
      });
    } else {
      seen.set(key, locationOf.get(r)!);
    }
  }

  // 같은 현장의 고정 정보는 전 기간 동일
  const firstBySite = new Map<string, DataRow>();
  for (const r of rows) {
    const base = firstBySite.get(r.siteId);
    if (!base) {
      firstBySite.set(r.siteId, r);
      continue;
    }
    for (const f of SITE_CONSTANT_FIELDS) {
      if (base[f] !== r[f]) {
        errors.push({
          location: locationOf.get(r)!,
          column: f,
          value: String(r[f]),
          message: `현장 ${r.siteId}의 ${f} 값이 다른 월(${base[f]})과 다릅니다.`,
        });
      }
    }
  }

  // 누적공정률·누적기성액은 줄어들 수 없음(교육 자료 기준)
  const bySite = new Map<string, DataRow[]>();
  for (const r of rows) {
    if (!bySite.has(r.siteId)) bySite.set(r.siteId, []);
    bySite.get(r.siteId)!.push(r);
  }
  for (const [siteId, list] of bySite) {
    const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      for (const f of ["plannedProgress", "actualProgress", "cumulativeEarned"] as const) {
        if (cur[f] < prev[f]) {
          errors.push({
            location: locationOf.get(cur)!,
            column: f,
            value: String(cur[f]),
            message: `현장 ${siteId}의 ${f}가 ${prev.month}(${prev[f]})보다 줄었습니다. 누적 값은 줄어들 수 없습니다.`,
          });
        }
      }
    }
  }

  const warnings = [...extraWarnings];
  if (rows.length > 0) {
    const months = rows.map((r) => r.month).sort();
    const first = months[0];
    const last = months[months.length - 1];
    for (const [siteId, list] of [...bySite].sort(([a], [b]) => a.localeCompare(b))) {
      const have = new Set(list.map((r) => r.month));
      const missing: string[] = [];
      for (let m = first; m <= last; m = nextMonth(m)) {
        if (!have.has(m)) missing.push(m);
      }
      if (missing.length > 0) {
        warnings.push(
          `현장 ${siteId}: ${missing.join(", ")} 자료가 없습니다. 확인 가능한 행만 집계하며, 전월이 없는 달의 당월기성액은 계산 불가입니다.`,
        );
      }
    }
  }

  const ok = errors.length === 0;
  const monthList = rows.map((r) => r.month).sort();
  return {
    ok,
    errors,
    warnings,
    notices: format === "CSV" ? ["CSV에는 단위 정보가 없어 금액은 백만원, 공정률은 %로 간주합니다."] : [],
    rows: ok ? rows : [],
    summary: ok
      ? {
          format,
          rowCount: rows.length,
          siteCount: new Set(rows.map((r) => r.siteId)).size,
          monthFirst: monthList[0] ?? "",
          monthLast: monthList[monthList.length - 1] ?? "",
        }
      : null,
  };
}

export function validateCsvText(text: string): ValidationResult {
  const { rows, lines } = parseCsvText(text);
  if (rows.length === 0) return fileError("파일이 비어 있습니다.");

  const header = rows[0].map((h) => h.trim());
  const missing = REQUIRED_FIELDS.filter((f) => !header.includes(f));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        {
          location: `${lines[0]}행`,
          column: missing.join(", "),
          value: "",
          message: "필수 열이 없습니다. 15개 열이 모두 있어야 합니다.",
        },
      ],
      warnings: [],
      notices: [],
      rows: [],
      summary: null,
    };
  }
  const extras = header.filter((h) => h !== "" && !(REQUIRED_FIELDS as readonly string[]).includes(h));
  const extraWarnings = extras.length > 0 ? [`15개 외의 열은 무시합니다: ${extras.join(", ")}`] : [];

  const items: Located[] = [];
  const shapeErrors: ImportIssue[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const location = `${lines[i]}행`;
    if (row.length !== header.length) {
      shapeErrors.push({
        location,
        column: "열 개수",
        value: `${row.length}개`,
        message: `열 개수가 헤더(${header.length}개)와 다릅니다.`,
      });
      continue;
    }
    const rec: Rec = {};
    header.forEach((h, idx) => {
      if (h) rec[h] = row[idx];
    });
    items.push({ rec, location });
  }
  if (items.length === 0 && shapeErrors.length === 0) return fileError("데이터 행이 없습니다.");

  const result = validateRecords(items, "CSV", extraWarnings);
  if (shapeErrors.length > 0) {
    result.errors = [...shapeErrors, ...result.errors];
    result.ok = false;
    result.rows = [];
    result.summary = null;
  }
  return result;
}

export function validateJsonText(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return fileError("JSON 형식을 읽을 수 없습니다. 파일이 깨졌거나 JSON이 아닙니다.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fileError("JSON 최상위가 metadata와 records를 가진 객체여야 합니다.");
  }
  const obj = parsed as { metadata?: Record<string, unknown>; records?: unknown };
  const errors: ImportIssue[] = [];
  const meta = obj.metadata;
  if (typeof meta !== "object" || meta === null) {
    errors.push({ location: "metadata", column: "metadata", value: "(누락)", message: "metadata가 없습니다." });
  } else {
    if (meta.schemaVersion !== "2.0") {
      errors.push({
        location: "metadata",
        column: "schemaVersion",
        value: show(meta.schemaVersion),
        message: "schemaVersion은 2.0이어야 합니다.",
      });
    }
    if (meta.moneyUnit !== "백만원") {
      errors.push({
        location: "metadata",
        column: "moneyUnit",
        value: show(meta.moneyUnit),
        message: "금액 단위는 백만원이어야 합니다.",
      });
    }
    if (meta.progressUnit !== "percent_0_100") {
      errors.push({
        location: "metadata",
        column: "progressUnit",
        value: show(meta.progressUnit),
        message: "공정률 단위는 percent_0_100이어야 합니다.",
      });
    }
    const req = meta.requiredFields;
    if (!Array.isArray(req)) {
      errors.push({
        location: "metadata",
        column: "requiredFields",
        value: show(req),
        message: "requiredFields 목록이 없습니다.",
      });
    } else {
      const lack = REQUIRED_FIELDS.filter((f) => !req.includes(f));
      if (lack.length > 0) {
        errors.push({
          location: "metadata",
          column: "requiredFields",
          value: lack.join(", "),
          message: "requiredFields에 빠진 열이 있습니다.",
        });
      }
    }
  }
  if (!Array.isArray(obj.records)) {
    errors.push({ location: "records", column: "records", value: "(누락)", message: "records 배열이 없습니다." });
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings: [], notices: [], rows: [], summary: null };
  }

  const records = obj.records as unknown[];
  if (records.length === 0) return fileError("records가 비어 있습니다.");
  const items: Located[] = [];
  const shapeErrors: ImportIssue[] = [];
  records.forEach((r, i) => {
    const location = `기록 ${i + 1}번째`;
    if (typeof r !== "object" || r === null || Array.isArray(r)) {
      shapeErrors.push({ location, column: "기록", value: show(r), message: "기록이 객체가 아닙니다." });
      return;
    }
    items.push({ rec: r as Rec, location });
  });
  const result = validateRecords(items, "JSON", []);
  if (shapeErrors.length > 0) {
    result.errors = [...shapeErrors, ...result.errors];
    result.ok = false;
    result.rows = [];
    result.summary = null;
  }
  return result;
}

/** 파일 이름·크기·내용을 한꺼번에 검사합니다(화면에서 파일을 읽은 직후 호출). */
export function validateImportFile(fileName: string, sizeBytes: number, text: string): ValidationResult {
  if (sizeBytes === 0 || text.trim() === "") return fileError("파일이 비어 있습니다.");
  if (sizeBytes > MAX_FILE_BYTES) return fileError("파일이 너무 큽니다(5MB 이하만 가져올 수 있습니다).");
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return validateCsvText(text);
  if (lower.endsWith(".json")) return validateJsonText(text);
  return fileError("CSV 또는 JSON 파일만 가져올 수 있습니다.", "파일 형식");
}
