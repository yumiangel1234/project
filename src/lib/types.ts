export const REQUIRED_FIELDS = [
  "month",
  "siteId",
  "siteName",
  "contractAmount",
  "plannedProgress",
  "actualProgress",
  "cumulativeEarned",
  "region",
  "projectType",
  "startDate",
  "contractEndDate",
  "currentWork",
  "issueCategory",
  "issueSummary",
  "actionPlan",
] as const;

export const NUMBER_FIELDS = [
  "contractAmount",
  "plannedProgress",
  "actualProgress",
  "cumulativeEarned",
] as const;

export const REGIONS = ["인천", "경기", "충남", "충북", "세종", "강원", "대전"];
export const PROJECT_TYPES = ["공동주택", "물류시설", "업무시설", "상업시설", "생산시설"];

export const MONTH_MIN = "2025-10";
export const MONTH_MAX = "2026-09";

export const ALL = "전체";

export type DataRow = {
  month: string;
  siteId: string;
  siteName: string;
  contractAmount: number;
  plannedProgress: number;
  actualProgress: number;
  cumulativeEarned: number;
  region: string;
  projectType: string;
  startDate: string;
  contractEndDate: string;
  currentWork: string;
  issueCategory: string;
  issueSummary: string;
  actionPlan: string;
};

export type Status = "정상" | "주의" | "점검";

export type Filter = {
  month: string;
  region: string;
  projectType: string;
  siteId: string;
};

export type ImportIssue = {
  location: string;
  column: string;
  value: string;
  message: string;
};

export type ImportSummary = {
  format: "CSV" | "JSON";
  rowCount: number;
  siteCount: number;
  monthFirst: string;
  monthLast: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ImportIssue[];
  warnings: string[];
  notices: string[];
  rows: DataRow[];
  summary: ImportSummary | null;
};
