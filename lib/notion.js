// lib/notion.js — 서버 전용. 노션 REST 헬퍼(내부 통합 토큰). ⚠️ 클라이언트에서 import 금지.
// 환경변수: NOTION_TOKEN(내부 통합 시크릿).
// 노션 REST 안정 버전 사용 — @notionhq/client 의존 없이 fetch만.
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

export function notionReady() {
  return Boolean(NOTION_TOKEN && process.env.NOTION_CUSTOMER_DB_ID);
}

// DB의 모든 페이지(raw)를 배열로 반환(100개씩 페이지네이션). 속성 추출은 호출부에서.
export async function fetchNotionPages(databaseId) {
  const out = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${BASE}/databases/${databaseId}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`notion query ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const page of json.results || []) out.push(page);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return out;
}

// '계정ID' → { pageId } 맵(고객 동기화 upsert용).
export async function fetchNotionRowsByAccount(databaseId) {
  const map = new Map();
  for (const page of await fetchNotionPages(databaseId)) {
    const acc = page.properties?.["계정ID"]?.rich_text?.[0]?.plain_text || "";
    if (acc) map.set(acc, { pageId: page.id });
  }
  return map;
}

export async function createNotionPage(databaseId, properties) {
  const res = await fetch(`${BASE}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
  if (!res.ok) throw new Error(`notion create ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateNotionPage(pageId, properties) {
  const res = await fetch(`${BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`notion update ${res.status}: ${await res.text()}`);
  return res.json();
}
