import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 디자인 시스템 참조 미러 — claude.ai/design에서 내려받은 벤더 코드다.
    // 앱 소스가 아니고(프로덕션 이식 금지) 목업용 인라인 스타일이라 앱 규칙을 적용할 대상이 아니다.
    "ONLY FOR TRAINER/**",
  ]),
]);

export default eslintConfig;
