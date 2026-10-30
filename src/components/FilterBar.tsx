"use client";

import { ALL } from "@/lib/types";
import { useData } from "./DataProvider";

export function scopeLabel(f: { month: string; region: string; projectType: string; siteId: string }): string {
  return [
    f.month,
    f.region === ALL ? "전체 지역" : f.region,
    f.projectType === ALL ? "전체 유형" : f.projectType,
    f.siteId === ALL ? "전체 현장" : `현장 ${f.siteId}`,
  ].join(" · ");
}

/** 월·지역·유형·현장 선택. 현황·비교표·CSV·AI가 모두 이 값을 같이 씁니다. */
export function FilterBar() {
  const { filter, months, regions, types, sites, notice, setMonth, setRegion, setType, setSite } = useData();
  return (
    <section className="filter-bar" aria-label="범위 선택">
      <div className="filters">
        <label>
          월
          <select id="filter-month" value={filter.month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          지역
          <select id="filter-region" value={filter.region} onChange={(e) => setRegion(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          공사 유형
          <select id="filter-type" value={filter.projectType} onChange={(e) => setType(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          현장
          <select id="filter-site" value={filter.siteId} onChange={(e) => setSite(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {sites.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {s.siteId} · {s.siteName.replace("[가상] ", "")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="scope-line" data-testid="scope-line">
        지금 범위: {scopeLabel(filter)}
      </p>
      {notice && (
        <p className="notice" role="status" data-testid="filter-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
