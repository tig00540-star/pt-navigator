// node --import ./scripts/demo/alias-loader.mjs … — 앱 코드의 "@/…" 경로를 프로젝트 루트로 풀어 준다(데모 스크립트 전용).
import { register } from "node:module";
register("./alias-resolve.mjs", import.meta.url);
