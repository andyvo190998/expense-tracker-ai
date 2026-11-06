import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const temporary = mkdtempSync(resolve(tmpdir(), "expense-contracts-"));
const expenseSchema = resolve(temporary, "expense.json");
const workforceSchema = resolve(temporary, "workforce.json");
const generated = resolve(packageRoot, "src/generated");

function run(command, args, cwd, env = {}) {
	execFileSync(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});
}

try {
	run(
		"uv",
		["run", "python", "scripts/export_openapi.py", expenseSchema],
		resolve(repoRoot, "apps/expense-api"),
		{
			DATABASE_URL: "sqlite+aiosqlite:///./contracts.db",
			OPENAI_API_KEY: "contract-generation-key",
		},
	);
	run(
		"pnpm",
		["openapi:export", "--", workforceSchema],
		resolve(repoRoot, "apps/workforce-api"),
		{ DATABASE_URL: "postgresql://expense:expense@localhost:5433/workforce" },
	);
	run("pnpm", ["exec", "openapi-typescript", expenseSchema, "-o", resolve(generated, "expense.ts")], packageRoot);
	run("pnpm", ["exec", "openapi-typescript", workforceSchema, "-o", resolve(generated, "workforce.ts")], packageRoot);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
