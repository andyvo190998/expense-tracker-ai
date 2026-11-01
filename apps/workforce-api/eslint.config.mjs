import parser from "@typescript-eslint/parser";
import plugin from "@typescript-eslint/eslint-plugin";

export default [{ files: ["src/**/*.ts", "test/**/*.ts"], languageOptions: { parser, parserOptions: { project: "./tsconfig.json" } }, plugins: { "@typescript-eslint": plugin }, rules: { ...plugin.configs.recommended.rules } }];
