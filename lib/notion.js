// lib/notion.js — 서버 전용. 노션 REST 헬퍼(내부 통합 토큰). ⚠️ 클라이언트에서 import 금지.
// 환경변수: NOTION_TOKEN(내부 통합 시크릿), NOTION_CUSTOMER_DB_ID('앱 고객 관리' DB id).
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

// DB의 모든 페이지를 '계정ID' → { pageId } 맵으로 반환(100개씩 페이지네이션).
// upsert 판단의 기준: 계정ID 속성에 Supabase account.id를 심어두고 그걸로 매칭.
export async function fetchNotionRowsByAccount(databaseId) {
  const map = new Map();
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
    for (const page of json.results || []) {
      const acc = page.properties?.["계정ID"]?.rich_text?.[0]?.plain_text || "";
      if (acc) map.set(acc, { pageId: page.id });
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
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
