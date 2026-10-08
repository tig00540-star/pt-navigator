// app/api/import-id/route.js — 다른 아이디에서 내 자료 가져오기(2026-10-08 · 대표 결정 '분리 방식')
// -----------------------------------------------------------------------------
// 아이디는 처음 만든 곳 것이다. 같은 사람이 아이디를 바꿀 때(센터 → 개인 · 개인 → 센터) '내 것'만 복사해 온다.
//   POST {email, password}               → 미리 보기(무엇을 몇 개 가져올 수 있는지)
//   POST {email, password, apply:{...}}  → 복사. apply = { packages, library, profile, cases, members }
// 가져오는 것(복사 · 원래 아이디에도 그대로 남음):
//   · 가격표 · 라이브러리 · 프로필(그 아이디 본인 것만)
//   · 사례 보관함 중 '포트폴리오 활용 동의'한 회원 사례만(사진 파일도 복사 · lib/portfolio)
//   · (개인 아이디 → 센터 아이디일 때만) 개인 회원에게 '센터로 옮길까요?' 묻기 → 동의한 회원만 이동(member_transfer kind 'import')
// 센터 아이디의 회원 기록은 센터 것이라 가져오지 않는다.
// 비밀번호 확인 = 그 아이디로 로그인해 보기(바로 그 세션만 끊음). 틀림은 import_fail에 남겨 10분 5번이면 잠깐 막는다.
// -----------------------------------------------------------------------------
import crypto from "crypto";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient, callerOf } from "@/lib/serverCaller";
import { sendPush } from "@/lib/pushServer";
import { caseOwner, caseFiles, portfolioAgreed } from "@/lib/portfolio";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const maxDuration = 60;

const FAIL_WINDOW = 10 * 60 * 1000, FAIL_MAX = 5;

async function failCount(sb, tid) {
  const { count, error } = await sb.from("import_fail").select("id", { count: "exact", head: true })
    .eq("trainer_id", tid).gte("created_at", new Date(Date.now() - FAIL_WINDOW).toISOString());
  return error ? 0 : count ?? 0;   // 표가 없으면(SQL 전) 막지 않음
}

const live = (a) => a?.subscription_status === "active" && (!a.current_period_end || Date.parse(a.current_period_end) > Date.now());

export async function POST(req) {
  const sb = serviceClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !anon) return Response.json({ error: "서버 설정을 확인해 주세요." }, { status: 503 });
  const me = await callerOf(sb, req);
  if (!me || me.kind !== "trainer") return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password || "").slice(0, 200);
  if (!email || !password) return Response.json({ error: "가져올 아이디의 이메일과 비밀번호를 입력해 주세요." }, { status: 400 });

  if ((await failCount(sb, me.id)) >= FAIL_MAX) {
    return Response.json({ error: "여러 번 틀려서 잠시 막아 뒀어요. 10분 뒤 다시 시도해 주세요." }, { status: 429 });
  }

  // 비밀번호 확인 — 그 아이디로 로그인해 보고, 바로 그 세션만 끊는다.
  const probe = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: si, error: se } = await probe.auth.signInWithPassword({ email, password });
  const srcUid = si?.user?.id;
  if (se || !srcUid) {
    await sb.from("import_fail").insert({ trainer_id: me.id }).then(() => {}, () => {});
    return Response.json({ error: "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요." }, { status: 400 });
  }
  if (si.session?.access_token) await sb.auth.admin.signOut(si.session.access_token, "local").catch(() => {});

  if (srcUid === me.id) return Response.json({ error: "지금 로그인한 아이디예요. 가져올 다른 아이디를 입력해 주세요." }, { status: 400 });
  const { data: src } = await sb.from("trainer").select("id, name, role, account_id").eq("id", srcUid).maybeSingle();
  if (!src) return Response.json({ error: "그 아이디에는 가져올 자료가 없어요." }, { status: 404 });
  if (src.account_id === me.account_id) return Response.json({ error: "같은 센터 아이디라서 가져올 필요가 없어요." }, { status: 400 });

  const [{ data: srcAcc }, { data: dstAcc }] = await Promise.all([
    sb.from("account").select("id, type, name").eq("id", src.account_id).maybeSingle(),
    sb.from("account").select("id, type, name, subscription_status, current_period_end").eq("id", me.account_id).maybeSingle(),
  ]);
  if (!live(dstAcc)) return Response.json({ error: "지금 아이디의 이용 기간이 끝났어요. 결제한 뒤 가져와 주세요." }, { status: 409 });

  // 가져올 수 있는 것
  const [pk, lib, prof, cases] = await Promise.all([
    sb.from("pt_package").select("*").eq("trainer_id", src.id).eq("account_id", src.account_id).order("sort"),
    sb.from("library_item").select("*").eq("trainer_id", src.id).eq("account_id", src.account_id),
    sb.from("trainer_profile").select("*").eq("trainer_id", src.id).maybeSingle(),
    sb.from("sales_case").select("*").eq("trainer_id", src.id).eq("account_id", src.account_id).order("created_at"),
  ]);
  const allCases = cases.data || [];
  const owners = allCases.map((c) => caseOwner(c, src.id));
  const agreed = await portfolioAgreed(sb, owners.filter(Boolean));
  const okCases = allCases.filter((c, i) => owners[i] && agreed.has(`${owners[i].member}:${owners[i].trainer}`));

  // 개인 회원 → 센터(개인 아이디 주인 → 센터 아이디일 때만)
  const memberMove = srcAcc?.type === "solo" && src.role === "owner" && dstAcc?.type === "center";
  let members = [];
  if (memberMove) {
    const { data: ms } = await fetchAllRows(() => sb.from("user_table").select("id, name, status, hidden, member_token").eq("account_id", src.account_id));
    const { data: pend } = await fetchAllRows(() => sb.from("member_transfer").select("id, member_id").eq("from_account", src.account_id).eq("status", "pending"));
    const pendSet = new Set((pend || []).map((p) => p.member_id));
    members = (ms || []).filter((m) => !m.hidden && m.status !== "inactive" && !pendSet.has(m.id));
  }

  const preview = {
    source: { name: src.name, account: srcAcc?.name || null, type: srcAcc?.type || null },
    packages: (pk.data || []).length,
    library: (lib.data || []).length,
    profile: Boolean(prof.data),
    cases: okCases.length,
    casesTotal: allCases.length,
    members: memberMove ? members.length : null,
  };
  if (!body.apply) return Response.json({ ok: true, preview });

  const ap = body.apply || {};
  const done = { packages: 0, library: 0, profile: false, cases: 0, members: 0, skipped: 0 };

  // ① 가격표 — 같은 이름 · 회차 · 가격이 이미 있으면 건너뜀
  if (ap.packages && pk.data?.length) {
    const { data: mine } = await sb.from("pt_package").select("name, sessions, price").eq("trainer_id", me.id).eq("account_id", me.account_id);
    const has = new Set((mine || []).map((x) => `${x.name}|${x.sessions}|${x.price}`));
    const rows = pk.data.filter((x) => !has.has(`${x.name}|${x.sessions}|${x.price}`))
      .map(({ id: _i, created_at: _c, account_id: _a, trainer_id: _t, ...rest }) => ({ ...rest, account_id: me.account_id, trainer_id: me.id }));
    if (rows.length) {
      const { data, error } = await sb.from("pt_package").insert(rows).select("id");
      if (error) console.error("[import-id] 가격표 복사 실패", error.message); else done.packages = data.length;
    }
  }
  // ② 라이브러리 — 같은 링크면 건너뜀
  if (ap.library && lib.data?.length) {
    const { data: mine } = await sb.from("library_item").select("url").eq("trainer_id", me.id).eq("account_id", me.account_id);
    const has = new Set((mine || []).map((x) => x.url));
    const rows = lib.data.filter((x) => !has.has(x.url))
      .map(({ id: _i, created_at: _c, updated_at: _u, account_id: _a, trainer_id: _t, ...rest }) => ({ ...rest, account_id: me.account_id, trainer_id: me.id }));
    if (rows.length) {
      const { data, error } = await sb.from("library_item").insert(rows).select("id");
      if (error) console.error("[import-id] 라이브러리 복사 실패", error.message); else done.library = data.length;
    }
  }
  // ③ 프로필 — 지금 아이디에 프로필이 없을 때만
  if (ap.profile && prof.data) {
    const { data: mine } = await sb.from("trainer_profile").select("trainer_id").eq("trainer_id", me.id).maybeSingle();
    if (!mine) {
      const { trainer_id: _t, account_id: _a, updated_at: _u, ...rest } = prof.data;
      const { error } = await sb.from("trainer_profile").insert({ ...rest, trainer_id: me.id, account_id: me.account_id });
      if (error) console.error("[import-id] 프로필 복사 실패", error.message); else done.profile = true;
    }
  }
  // ④ 포트폴리오 사례 — 동의한 것만 · 사진은 파일째 sales-cases/{지금 계정}/portfolio/ 로 복사 · 이미 가져온 사례는 건너뜀
  if (ap.cases && okCases.length) {
    const { data: mine } = await sb.from("sales_case").select("data").eq("trainer_id", me.id).eq("account_id", me.account_id);
    const already = new Set((mine || []).map((x) => x.data?.portfolio?.src_case).filter(Boolean));
    for (const c of okCases) {
      const origin = c.data?.portfolio?.src_case || c.id;
      if (already.has(origin) || already.has(c.id)) { done.skipped++; continue; }
      const o = caseOwner(c, src.id);
      const data = { ...(c.data || {}), portfolio: { member: o.member, trainer: o.trainer, src_case: origin, copied_at: new Date().toISOString() } };
      let failed = false;
      for (const f of caseFiles(c)) {
        const { data: blob, error: de } = await sb.storage.from(f.bucket).download(f.path);
        if (de || !blob) { failed = true; break; }
        const path = `${me.account_id}/portfolio/${crypto.randomUUID()}.jpg`;
        const { error: ue } = await sb.storage.from("sales-cases").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
        if (ue) { failed = true; break; }
        if (f.key === "path") data.path = path;
        else data[f.key] = { ...(data[f.key] || {}), path, bucket: "sales-cases" };
      }
      if (failed) { done.skipped++; continue; }
      const { error } = await sb.from("sales_case").insert({
        account_id: me.account_id, trainer_id: me.id, kind: c.kind, member_id: null,
        label: c.label, data, note: c.note, sort: c.sort ?? 0,
      });
      if (error) { console.error("[import-id] 사례 복사 실패", error.message); done.skipped++; } else done.cases++;
    }
  }
  // ⑤ 개인 회원에게 '센터로 옮길까요?'(동의한 회원만 이동 · 14일)
  if (ap.members && memberMove && members.length) {
    const toName = dstAcc.name || "센터";
    const rows = members.map((m) => ({
      member_id: m.id, member_name: m.name, from_account: src.account_id, to_account: me.account_id,
      trainer_id: me.id, from_trainer: src.id, kind: "import", to_name: toName,
    }));
    const { data, error } = await sb.from("member_transfer").insert(rows).select("member_id");
    if (error) console.error("[import-id] 이동 요청 실패", error.message);
    else {
      done.members = data.length;
      after(async () => {
        for (const m of members) {
          if (!m.member_token) continue;
          await sendPush(sb, { memberIds: [m.id], type: "transfer", url: `/m/${m.member_token}`,
            title: "기록을 함께 옮길까요?", body: `${src.name} 트레이너가 앞으로 ${toName}에서 회원님 기록을 관리해요. 회원 페이지에서 옮길지 골라 주세요.` }).catch(() => {});
        }
      });
    }
  }

  return Response.json({ ok: true, preview, done });
}
