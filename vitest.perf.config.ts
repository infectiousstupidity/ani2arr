// vitest.perf.config.ts
// Timing harnesses for hot paths. Run with `pnpm perf`. Not part of `pnpm test`.
import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
	plugins: [WxtVitest()],
	test: {
		environment: "node",
		globals: false,
		include: ["perf/**/*.perf.ts", "perf/**/*.perf.tsx"],
		setupFiles: ["./vitest.setup.ts"],
		testTimeout: 300_000,
		hookTimeout: 300_000,
		fileParallelism: false,
		restoreMocks: true,
		unstubGlobals: true,
	},
});
