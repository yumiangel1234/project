"use client";

import { useMemo } from "react";
import { aggregate, inspectionOrder, metricsForRows, scopeRows, trend } from "@/lib/calc";
import { useData } from "./DataProvider";

/** 현황·비교표·CSV·AI가 같은 범위를 쓰도록, 지금 필터로 계산한 결과를 한 곳에서 만듭니다. */
export function useScope() {
  const { data, index, filter } = useData();
  return useMemo(() => {
    if (!data) return null;
    const rows = scopeRows(data, filter);
    const metrics = metricsForRows(rows, index);
    return {
      rows,
      metrics,
      agg: aggregate(rows, index),
      inspection: inspectionOrder(metrics),
      trend: trend(data, filter, index),
    };
  }, [data, index, filter]);
}
