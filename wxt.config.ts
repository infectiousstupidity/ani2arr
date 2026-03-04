// wxt.config.ts
import { defineConfig, type WxtViteConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

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
    "@wxt-dev/module-react",
    "@wxt-dev/auto-icons",
    "@wxt-dev/webextension-polyfill",
  ],

  react: {
    vite: {
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    },
  },

  vite: () =>
    ({
      plugins: [
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
    } as WxtViteConfig),

  manifest: ({ manifestVersion }) => {
    const requiredHosts = [
      "https://anilist.co/*",
      "https://www.anilist.co/*",
      "https://graphql.anilist.co/*",
      "https://anichart.net/*",
      "https://www.anichart.net/*",
      "https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/v2/mappings.json",
      "https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json",
    ];

    const basePermissions = ["storage", "alarms"];

    const mv3Permissions = {
      permissions: basePermissions,
      host_permissions: requiredHosts,
      optional_host_permissions: ["http://*/*", "https://*/*"],
    };

    const mv2Permissions = {
      permissions: [...basePermissions, ...requiredHosts],
      optional_permissions: ["http://*/*", "https://*/*"],
    };

    return {
      name: "ani2arr",
      description:
        'Adds a one-click "Add to Sonarr" button to AniList and AniChart pages',
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
