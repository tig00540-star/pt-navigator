// lib/exportDownload.js — 내 데이터 내려받기(브라우저 · 2026-10-08).
//   ① /api/export → CSV 묶음 ZIP(서버) ② /api/export?images=1 → 사진 파일 목록(1시간 링크)
//   ③ 브라우저가 사진을 받아 ①의 파일들과 한 ZIP으로 다시 묶어 저장한다.
//   (사진까지 서버에서 묶으면 응답 크기 제한에 걸린다 · 압축 없는 store ZIP이라 읽기 · 쓰기가 간단하다)
import { authHeader } from "@/lib/authHeader";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = new TextEncoder();

/** 우리 서버가 만든 store ZIP 읽기 → [{name, data:Uint8Array}] */
function readStoreZip(buf) {
  const u = new Uint8Array(buf), v = new DataView(buf), out = [];
  let p = 0;
  while (p + 30 <= u.length && v.getUint32(p, true) === 0x04034b50) {
    const size = v.getUint32(p + 18, true), nlen = v.getUint16(p + 26, true), xlen = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(u.subarray(p + 30, p + 30 + nlen));
    const start = p + 30 + nlen + xlen;
    out.push({ name, data: u.subarray(start, start + size) });
    p = start + size;
  }
  return out;
}

/** [{name, data:Uint8Array}] → Blob(store ZIP · 이름 UTF-8) */
function makeZipBlob(files, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(c.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.buffer], { type: "application/zip" });
}

async function failMsg(res) {
  const j = await res.json().catch(() => ({}));
  return j.error || "내려받지 못했어요. 다시 시도해 주세요.";
}

/** @param {(text:string)=>void} [onProgress] @returns {Promise<{photos:number, missed:number}>} */
export async function downloadMyData(onProgress) {
  const headers = await authHeader();
  onProgress?.("기록을 모으는 중…");
  const res = await fetch("/api/export", { method: "POST", headers });
  if (!res.ok) throw new Error(await failMsg(res));
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "오직트레이너_데이터.zip";
  const files = readStoreZip(await res.arrayBuffer());

  let photos = 0, missed = 0;
  try {
    const ir = await fetch("/api/export?images=1", { method: "POST", headers });
    const list = ir.ok ? (await ir.json()).images || [] : [];
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const it = list[i++];
        onProgress?.(`사진 받는 중 ${Math.min(i, list.length)} / ${list.length}`);
        try {
          const r = await fetch(it.url);
          if (!r.ok) { missed++; continue; }
          files.push({ name: it.name, data: new Uint8Array(await r.arrayBuffer()) });
          photos++;
        } catch { missed++; }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } catch (e) {
    console.error("사진 목록 받기 실패", e);   // 사진이 빠져도 기록 ZIP은 내려준다
  }

  onProgress?.("파일 만드는 중…");
  const url = URL.createObjectURL(makeZipBlob(files));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { photos, missed };
}
