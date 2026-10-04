/* fetchByIds — 회원(또는 일지) id 목록으로 표를 끝까지 읽는다(2026-10-06 오류 점검).
   '.in("user_id", ids)'만 걸면 PostgREST 1000행에서 조용히 잘린다(이탈 위험 · 다음 예약 미정 · 재등록 타이밍 · PT 종료가 틀림).
   id는 100개씩 나눠 묻고(주소 길이), 각 묶음은 fetchAllRows로 끝까지 페이지를 넘긴다. 반환은 { data, error }.
   extra = (query) => query.eq(...) 처럼 조건을 더할 때. */
import { fetchAllRows } from "@/lib/fetchAllRows";

export async function fetchByIds(supabase, table, cols, column, ids, extra) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const { data, error } = await fetchAllRows(() => {
      const q = supabase.from(table).select(cols).in(column, chunk);
      return extra ? extra(q) : q;
    });
    if (error) return { data: null, error };
    out.push(...data);
  }
  return { data: out, error: null };
}
