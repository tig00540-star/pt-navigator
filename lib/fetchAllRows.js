/* =========================================================================
   fetchAllRows — PostgREST의 Max rows(기본 1000) 조용한 잘림을 막는 페이지 페처.

   ── 왜 필요한가 (종합점검 P0-6) ──
   필터·limit 없는 select는 1000행에서 **에러도 경고도 없이 잘린다.** 그러면
   그 행을 세어 계산하는 급여·매출·잔여·이탈 숫자가 "틀린 채로 멀쩡히" 표시된다.
   daily_workout_log는 수업 1건당 1행이라 가장 빨리 쌓인다(하루 15~16 수업 트레이너면
   센터 단위로 몇 주면 1000 도달). 관리자 대시보드는 센터 전체 로그를 통째로 부른다.

   ── 무엇을 하나 ──
   .range()로 페이지를 끝까지 훑어 전 행을 모은다. 행 수·Max rows 설정과 무관하게
   잘림이 원천적으로 불가능해진다. 계산식은 안 건드린다 — 잘려 있던 입력을 완전하게
   채워줄 뿐이라 숫자가 더 정확해지기만 하지 틀려질 길이 없다.

   ── 정렬이 필수인 이유 ──
   .range()는 서버가 정한 순서에 의존한다. 순서가 흔들리면 페이지 경계에서 같은 행이
   두 번 오거나(중복) 빠진다(누락). 그래서 **유니크 컬럼(기본 id=PK)으로 강제 정렬**한다.
   created_at 류는 동시각 충돌로 유니크가 깨질 수 있어 정렬 기준으로 부적합.

   ── 사용법 ──
   빌더는 한 번만 await되므로 매 페이지마다 새로 만들어야 한다 → thunk로 받는다.
     const { data, error } = await fetchAllRows(() =>
       supabase.from("daily_workout_log").select("*"));
   반환은 supabase와 같은 { data, error } 형태라 기존 destructure에 드롭인.
   ========================================================================= */
export async function fetchAllRows(makeQuery, { pageSize = 1000, orderColumn = "id" } = {}) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery()
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };       // 실패는 그대로 전달(호출부가 기존대로 처리)
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;             // 마지막 페이지 — 더 없음
  }
  return { data: all, error: null };
}
