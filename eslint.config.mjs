// ESLint (flat config)。拡張機能本体は素の <script> として読み込まれる古典スクリプト、
// scripts/ と test/ は Node の ESM という 3 種類の実行環境が混在している。
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

// common.js が popup / options 向けに公開しているグローバル
const commonGlobals = {
  QM_DEFAULTS: "readonly",
  QM_RESERVED_SEGMENTS: "readonly",
  qmNormalizeId: "readonly",
  qmTryParseQiitaUrl: "readonly",
  qmExtractUserId: "readonly",
  qmExtractOrgId: "readonly",
  qmLoadSettings: "readonly",
  qmUniqueSorted: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "icons/**"],
  },
  js.configs.recommended,

  // 拡張機能本体 (content / popup / options / common)。
  // package.json の "type": "module" に関わらず古典スクリプトとして読まれる。
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-implicit-globals": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // common.js のトップレベル宣言は popup / options から参照される (未使用扱いにしない)
  {
    files: ["common.js"],
    rules: {
      "no-unused-vars": "off",
    },
  },
  {
    files: ["popup.js", "options.js"],
    languageOptions: {
      globals: commonGlobals,
    },
  },

  // Node 上で動く ESM
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs", "*.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // フォーマットに関わるルールは Prettier に任せる (必ず最後)
  prettier,
];
