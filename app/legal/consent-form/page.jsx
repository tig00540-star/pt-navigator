// 종이 동의서(인쇄용) — OT 문진 때 회원에게 받는 개인정보 · 건강정보 동의(2026-10-05).
// 문구는 회원 전용 페이지 첫 화면과 같은 lib/consent.js. 받은 뒤 회원 등록 · 정보 수정에서 '동의를 받았어요'를 체크한다.
// 센터가 개인정보처리자(동의받는 쪽)라 센터명 칸을 비워 둔다. ⚠️ 법률 자문이 아님 · 실제 운영 전 전문가 검토 권장.
import { Title, P } from "@/components/legal/ui";
import PrintButton from "@/components/legal/PrintButton";
import { CONSENT_VERSION, GENERAL_CONSENT, HEALTH_CONSENT, LOG_CONFIRM_NOTICE } from "@/lib/consent";

export const metadata = { title: "개인정보 · 건강정보 동의서 · 오직 트레이너" };

function Box({ c }) {
  return (
    <section className="mt-6 break-inside-avoid rounded-xl border border-line-strong p-4">
      <h2 className="text-[15.5px] font-bold text-ink">[{c.required ? "필수" : "선택"}] {c.title}</h2>
      <table className="mt-3 w-full border-collapse text-[13.5px] leading-relaxed">
        <tbody>
          {c.rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line align-top">
              <th className="w-[88px] py-2 pr-3 text-left font-semibold text-sub">{k}</th>
              <td className="py-2 text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[14px] text-ink">
        위 내용에 <span className="mx-1 inline-block h-4 w-4 translate-y-[3px] border border-ink" /> 동의합니다
        <span className="ml-4 mr-1 inline-block h-4 w-4 translate-y-[3px] border border-ink" /> 동의하지 않습니다
      </p>
    </section>
  );
}

function Line({ label }) {
  return (
    <div className="flex items-end gap-3">
      <span className="w-16 shrink-0 text-[14px] font-semibold text-sub">{label}</span>
      <span className="h-8 flex-1 border-b border-ink" />
    </div>
  );
}

export default function ConsentFormPage() {
  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title>개인정보 · 건강정보 수집 · 이용 동의서</Title>
        <PrintButton />
      </div>
      <P>센터(또는 담당 트레이너)는 PT 수업과 회원 전용 페이지 운영을 위해 아래와 같이 개인정보를 모으고 써요. 건강정보는 따로 동의를 받아요.</P>

      <div className="mt-5"><Line label="센터명 · 상호" /></div>

      <Box c={GENERAL_CONSENT} />
      <Box c={LOG_CONFIRM_NOTICE} />
      <Box c={HEALTH_CONSENT} />

      <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
        AI 처리를 위한 국외 이전 등 자세한 내용은 개인정보처리방침(onlytrainer.co.kr/legal/privacy)에서 볼 수 있어요. 문구 버전 {CONSENT_VERSION}.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        <Line label="날짜" />
        <Line label="회원 이름" />
        <Line label="서명" />
        <Line label="담당" />
      </div>
    </article>
  );
}
