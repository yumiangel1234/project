import Link from "next/link";

export function NoData() {
  return (
    <section className="state-box" data-testid="no-data">
      <h2>자료가 없습니다</h2>
      <p>먼저 자료를 가져오세요. 앱을 새로고침하면 가져온 자료가 사라지므로 파일을 다시 가져와야 합니다.</p>
      <Link href="/import" className="btn primary">
        자료 가져오기
      </Link>
    </section>
  );
}
