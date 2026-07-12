// lib/announce.js
// 앱내 공지 순수함수. RLS가 이미 '내 계정+내 대상+원장' 범위로 좁혀 내려주지만,
// 원장은 전체를 받으므로(관리용) 게이트/벨 판정은 여기서 '내 대상'만 한 번 더 거른다.
// 순수·now 미참조(비교 재료는 컴포넌트가 주입). memberStatus.js와 도메인이 달라 새 파일로 격리.

/** 이 공지가 uid에게 온 것인가. target 비면 전체공지 = 모두 대상. */
export function isTargeted(ann, uid) {
  if (!ann) return false;
  const t = ann.target_trainer_ids;
  if (t == null || (Array.isArray(t) && t.length === 0)) return true; // 전체
  return Array.isArray(t) && uid != null && t.includes(uid);
}

/** 정렬: 핀 먼저, 그 안에서 최신순. */
function byPinnedThenNew(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return a.created_at < b.created_at ? 1 : -1;
}

/**
 * 안읽음 전체 — 내게 온 공지 중 (내가 쓴 것 아님) AND (아직 안 읽음). 일반+필수확인 모두.
 * → 헤더 벨 배지 카운트의 근거. 게이트는 이 결과에서 must_ack만 다시 거른다(mustAckUnread).
 * @param {Array} anns  announcement 행들(RLS로 내려온 것)
 * @param {Set|Array} readIds  내가 읽은 announcement_id 집합
 * @param {string} uid  로그인 트레이너 id
 */
export function unreadAnnouncements(anns, readIds, uid) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  return (Array.isArray(anns) ? anns : [])
    .filter((a) => a && isTargeted(a, uid) && a.author_id !== uid && !read.has(a.id))
    .sort(byPinnedThenNew);
}

/** 게이트용 — 안읽음 중 필수확인만(앱을 막을 대상). 일반 공지는 여기 안 들어옴. */
export function mustAckUnread(anns, readIds, uid) {
  return unreadAnnouncements(anns, readIds, uid).filter((a) => a.must_ack === true);
}

/** 벨(재열람)용 — 내게 온 공지 전체(읽음 포함, 내가 쓴 것 제외). 각 행에 read 플래그 부착. */
export function visibleAnnouncements(anns, readIds, uid) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  return (Array.isArray(anns) ? anns : [])
    .filter((a) => a && isTargeted(a, uid) && a.author_id !== uid)
    .map((a) => ({ ...a, read: read.has(a.id) }))
    .sort(byPinnedThenNew);
}
