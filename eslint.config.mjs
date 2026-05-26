import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noCloudStaticImport from "./eslint-rules/no-cloud-static-import.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      artiline: {
        rules: {
          "no-cloud-static-import": noCloudStaticImport,
        },
      },
    },
    rules: {
      "artiline/no-cloud-static-import": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/migrations/**",
    ".claude/**",
    ".claude-stkr/**",
  ]),
]);

export default eslintConfig;
