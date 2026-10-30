import fs from "node:fs";
import path from "node:path";
import { buildIndex } from "@/lib/calc";
import { ALL, DataRow, Filter } from "@/lib/types";
import { validateCsvText, validateJsonText } from "@/lib/validate";

const dataDir = path.resolve(__dirname, "../data");

export function readData(name: string): string {
  return fs.readFileSync(path.join(dataDir, name), "utf8");
}

export function readErrorFile(name: string): string {
  return fs.readFileSync(path.join(dataDir, "검증용_오류데이터", name), "utf8");
}

export function loadCsvRows(): DataRow[] {
  const r = validateCsvText(readData("현장공정기성.csv"));
  if (!r.ok) throw new Error("원본 CSV 검사 실패: " + JSON.stringify(r.errors.slice(0, 3)));
  return r.rows;
}

export function loadJsonRows(): DataRow[] {
  const r = validateJsonText(readData("현장공정기성.json"));
  if (!r.ok) throw new Error("원본 JSON 검사 실패: " + JSON.stringify(r.errors.slice(0, 3)));
  return r.rows;
}

export const data = loadCsvRows();
export const index = buildIndex(data);

export function filter(over: Partial<Filter> = {}): Filter {
  return { month: "2026-09", region: ALL, projectType: ALL, siteId: ALL, ...over };
}
