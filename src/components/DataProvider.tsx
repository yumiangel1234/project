"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import {
  allSites,
  buildIndex,
  defaultFilter,
  distinctMonths,
  distinctRegions,
  distinctTypes,
  normalizeFilter,
  RowIndex,
  SiteInfo,
  sitesInScope,
} from "@/lib/calc";
import { ALL, DataRow, Filter } from "@/lib/types";

export type DataMeta = {
  fileName: string;
  format: "CSV" | "JSON";
  rowCount: number;
  siteCount: number;
};

type Ctx = {
  /** 가져온 자료(없으면 null). 새로고침하면 사라집니다. */
  data: DataRow[] | null;
  meta: DataMeta | null;
  filter: Filter;
  notice: string | null;
  highlightSite: string | null;
  index: RowIndex;
  months: string[];
  regions: string[];
  types: string[];
  /** 지역·유형 범위 안의 현장(현장 선택 목록) */
  sites: SiteInfo[];
  replaceData: (rows: DataRow[], meta: DataMeta) => void;
  setMonth: (month: string) => void;
  setRegion: (region: string) => void;
  setType: (projectType: string) => void;
  setSite: (siteId: string) => void;
  setHighlight: (siteId: string | null) => void;
};

const DataContext = createContext<Ctx | null>(null);

const EMPTY_FILTER: Filter = { month: "", region: ALL, projectType: ALL, siteId: ALL };

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataRow[] | null>(null);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlightSite, setHighlightSite] = useState<string | null>(null);

  const index = useMemo(() => buildIndex(data ?? []), [data]);
  const months = useMemo(() => distinctMonths(data ?? []), [data]);
  const regions = useMemo(() => distinctRegions(data ?? []), [data]);
  const types = useMemo(() => distinctTypes(data ?? []), [data]);
  const sites = useMemo(
    () => (data ? sitesInScope(data, filter.region, filter.projectType) : allSites([])),
    [data, filter.region, filter.projectType],
  );

  // 자료 전체 교체: 이어붙이지 않고, 필터는 가장 최근 월·전체로 되돌립니다.
  const replaceData = useCallback((rows: DataRow[], nextMeta: DataMeta) => {
    setData(rows);
    setMeta(nextMeta);
    setFilter(defaultFilter(rows));
    setNotice(null);
    setHighlightSite(null);
  }, []);

  const update = useCallback(
    (patch: Partial<Filter>) => {
      if (!data) return;
      const { filter: next, reset } = normalizeFilter(data, { ...filter, ...patch });
      setFilter(next);
      setNotice(reset ? "범위가 바뀌어 현장 선택을 전체로 바꿨습니다." : null);
      setHighlightSite(null);
    },
    [data, filter],
  );

  const value = useMemo<Ctx>(
    () => ({
      data,
      meta,
      filter,
      notice,
      highlightSite,
      index,
      months,
      regions,
      types,
      sites,
      replaceData,
      setMonth: (month) => update({ month }),
      setRegion: (region) => update({ region }),
      setType: (projectType) => update({ projectType }),
      setSite: (siteId) => update({ siteId }),
      setHighlight: setHighlightSite,
    }),
    [data, meta, filter, notice, highlightSite, index, months, regions, types, sites, replaceData, update],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("DataProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
