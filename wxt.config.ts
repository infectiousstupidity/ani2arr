// wxt.config.ts
import { defineConfig, type WxtViteConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

export default defineConfig({
	webExt: {
		openDevtools: true,
		chromiumArgs: ["--auto-open-devtools-for-tabs"],
	},
	dev: {
		server: {
			port: 3334,
		},
	},
	srcDir: "src",

	modules: [
		"@wxt-dev/auto-icons",
		"@wxt-dev/webextension-polyfill",
		"@wxt-dev/i18n/module",
	],

	vite: () =>
		({
			plugins: [
				react(),
				babel({
					presets: [reactCompilerPreset()],
				}),
				tailwindcss(),
			],
			css: { devSourcemap: true },
			build: {
				sourcemap: (() => {
					const sm = process.env.GENERATE_SOURCEMAP;
					if (sm === "true") return true;
					if (sm === "hidden") return "hidden";
					if (sm === "inline") return "inline";
					return false;
				})(),
			},
		}) as WxtViteConfig,

	manifest: ({ manifestVersion }) => {
		const backgroundFetchHosts = [
			"https://graphql.anilist.co/*",
			"https://api.jikan.moe/*",
			"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json",
			"https://release-assets.githubusercontent.com/*",
		];

		const basePermissions = ["storage", "alarms"];

		const mv3Permissions = {
			permissions: basePermissions,
			host_permissions: backgroundFetchHosts,
			optional_permissions: ["cookies"],
			optional_host_permissions: ["http://*/*", "https://*/*"],
		};

		const mv2Permissions = {
			permissions: [...basePermissions, ...backgroundFetchHosts],
			optional_permissions: ["cookies", "http://*/*", "https://*/*"],
		};

		return {
			name: "__MSG_extName__",
			description: "__MSG_extDescription__",
			default_locale: "en",
			...(manifestVersion === 3 ? mv3Permissions : mv2Permissions),
			options_ui: {
				page: "options/index.html",
				open_in_tab: true,
			},
			browser_specific_settings: {
				gecko: {
					id: "infectiousstupidity@proton.me",
					strict_min_version: "142.0",
					data_collection_permissions: {
						required: ["authenticationInfo", "websiteContent"],
					},
				},
			},
		};
	},
});
