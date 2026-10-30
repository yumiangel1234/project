import { Status } from "@/lib/types";

const MARK: Record<Status, string> = { 정상: "●", 주의: "▲", 점검: "■" };

/** 색만으로 구분하지 않도록 글자와 모양을 함께 씁니다. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`} data-status={status}>
      <span aria-hidden="true">{MARK[status]}</span> {status}
    </span>
  );
}
