// 무료 이용 열어 주기 공용(2026-10-19) — 업무 사이트(/api/ops/trial)와 베타 가입(/api/billing/beta-trial)이 같은 규칙을 쓴다. ⚠️ 서버 전용(service_role).
//   열 수 있는 계정 = 계정 주인(대표 · 개인) · 결제(DONE) 이력 없음 · 예전 무료 체험(TRIAL) 없음 · 지금 이용 중 아님 · 처음(계정당 한 번 = ops_alert key trial_{계정}).
//   열면 이용 중(active) + 끝나는 날 = 지금 + days. 결제 기록(payment)은 만들지 않는다 → 나중 첫 결제가 그대로 '첫 결제 7일 안 전액 환불' 대상.
//   기간 안에 카드를 등록하면 결제 없이 카드만 저장 → 끝나는 날 결제 작업이 첫 달을 청구 · 카드 없이 끝나면 30일 '볼 수만'.
const DAY = 86400000;

/** 계정이 무료 이용을 열 수 있는지. @returns {{ paid, oldTrial, granted, activeNow, block: string|null }} */
export async function trialState(sb, { role, acct }) {
  const [{ data: pays }, { data: granted }] = await Promise.all([
    sb.from("payment").select("id, status").eq("account_id", acct.id).in("status", ["DONE", "TRIAL"]).limit(5),
    sb.from("ops_alert").select("id, created_at, detail").eq("key", `trial_${acct.id}`).maybeSingle(),
  ]);
  const end = acct.current_period_end ? Date.parse(acct.current_period_end) : 0;
  const activeNow = acct.subscription_status === "active" && end > Date.now();
  const paid = (pays || []).some((p) => p.status === "DONE");
  const oldTrial = (pays || []).some((p) => p.status === "TRIAL");
  let block = null;
  if (role !== "owner") block = "센터 트레이너 아이디예요. 센터 대표가 가입한 이메일로 열어 주세요.";
  else if (granted) block = "이미 무료 이용을 열어 준 계정이에요(계정당 한 번).";
  else if (paid) block = "이미 결제한 계정이에요. 무료 이용 대상이 아니에요.";
  else if (oldTrial) block = "예전 무료 체험을 쓴 계정이에요.";
  else if (activeNow) block = "지금 이용 중인 계정이에요.";
  return { paid, oldTrial, activeNow, granted: granted ? { at: granted.created_at, until: granted.detail?.until || null } : null, block };
}

/** 무료 이용 열기(규칙 확인은 부르는 쪽에서 trialState로 먼저). @returns {{ ok:true, until, periodEnd } | { ok:false, error, status }} */
export async function grantTrial(sb, { acct, days, by, note = null, label, email = null }) {
  const now = Date.now();
  const until = new Date(now + days * DAY).toISOString();
  const type = acct.type === "center" ? "center" : "solo";
  // 기록부터(계정당 한 번 · key 고유) — 두 번 눌러도 한 번만 열린다
  const { data: rec, error: re } = await sb.from("ops_alert").insert({
    key: `trial_${acct.id}`, kind: "trial_grant", severity: "info", status: "done", account_id: acct.id,
    title: `${type === "center" ? "센터" : "개인"} 무료 이용 ${days}일 열어 줌 · ${label}`,
    detail: { email, type, days, until },
    handled_at: new Date(now).toISOString(), handled_by: by, note,
  }).select("id");
  if (re || !rec?.length) {
    const dup = /duplicate|unique/i.test(re?.message || "");
    return { ok: false, status: dup ? 409 : 500, error: dup ? "이미 무료 이용을 열어 준 계정이에요(계정당 한 번)." : "기록을 남기지 못했어요. 다시 시도해 주세요." };
  }
  const { data: up, error: ue } = await sb.from("account").update({
    subscription_status: "active", plan: "premium", current_period_end: until, cancel_at_period_end: false,
    billing_plan: acct.billing_plan || (type === "center" ? "center" : "solo"),
  }).eq("id", acct.id).select("id, current_period_end");
  if (ue || !up?.length) {
    await sb.from("ops_alert").delete().eq("id", rec[0].id); // 못 열었으면 기록도 되돌려 다시 할 수 있게
    return { ok: false, status: 500, error: "계정을 열지 못했어요. 다시 시도해 주세요." };
  }
  return { ok: true, until, periodEnd: up[0].current_period_end };
}
