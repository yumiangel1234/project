export const NA = "계산 불가";

/** 중간 계산은 반올림하지 않고, 화면에 보일 때만 소수 첫째 자리로 반올림합니다. 음수 영은 0으로 만듭니다. */
export function round1(x: number): number {
  const r = Math.round(Math.abs(x) * 10 + 1e-9) / 10;
  const v = x < 0 ? -r : r;
  return v === 0 ? 0 : v;
}

export function fmtPct(x: number | null | undefined): string {
  return x == null ? NA : `${round1(x).toFixed(1)}%`;
}

export function fmtPp(x: number | null | undefined): string {
  return x == null ? NA : `${round1(x).toFixed(1)}pp`;
}

/** 백만원 단위 금액, 소수 첫째 자리. */
export function fmtMoney(x: number | null | undefined): string {
  if (x == null) return NA;
  return round1(x).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** 계약금액처럼 정수로 떨어지는 금액(86,400). 소수가 있으면 소수 첫째 자리까지. */
export function fmtAmount(x: number | null | undefined): string {
  if (x == null) return NA;
  return round1(x).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/** CSV 같은 파일용 숫자 문자열(천 단위 쉼표 없음). null 이면 빈칸. */
export function plain1(x: number | null | undefined): string {
  return x == null ? "" : round1(x).toFixed(1);
}
