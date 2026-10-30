"use client";

import { ExportButton } from "@/components/ExportButton";
import { FilterBar } from "@/components/FilterBar";
import { InspectionList } from "@/components/InspectionList";
import { useData } from "@/components/DataProvider";
import { Metrics } from "@/components/Metrics";
import { MonthlyBars } from "@/components/MonthlyBars";
import { NoData } from "@/components/NoData";
import { TrendChart } from "@/components/TrendChart";
import { useScope } from "@/components/useScope";

export default function HomePage() {
  const { data } = useData();
  const scope = useScope();

  if (!data || !scope) {
    return (
      <main className="page">
        <h1>현황 요약</h1>
        <NoData />
      </main>
    );
  }

  return (
    <main className="page">
      <h1>현황 요약</h1>
      <FilterBar />
      {scope.agg.empty && (
        <section className="state-box" data-testid="empty-scope">
          <h2>선택 범위에 자료가 없습니다</h2>
          <p>조건에 맞는 현장이 없어 값을 계산할 수 없습니다. 0%로 대신하지 않습니다. 지역·유형·현장을 바꿔 보세요.</p>
        </section>
      )}
      <ExportButton />
      <Metrics agg={scope.agg} />
      {!scope.agg.empty && <InspectionList inspection={scope.inspection} agg={scope.agg} />}
      <div className="charts">
        <TrendChart points={scope.trend} />
        <MonthlyBars points={scope.trend} />
      </div>
    </main>
  );
}
