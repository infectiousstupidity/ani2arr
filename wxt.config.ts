// wxt.config.ts
import { defineConfig, type WxtViteConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  webExt: {
    openDevtools: true,
  },
  dev: {
    server: {
      port: 3334,
    },
  },
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  vite: () =>
    ({
      plugins: [tailwindcss()],
      css: { devSourcemap: true },
      build: { sourcemap: process.env.GENERATE_SOURCEMAP || false },
    } as WxtViteConfig),
  manifest: ({ manifestVersion }) => {
    const requiredHosts = [
      'https://anilist.co/*',
      'https://graphql.anilist.co/*',
      'https://anichart.net/*',
      'https://www.anichart.net/*',
      'https://raw.githubusercontent.com/*', // For the static mapping file
    ];

    // Add "alarms" here so both MV2 and MV3 get it.
    const basePermissions = ['storage', 'alarms'];

    const mv3Permissions = {
      permissions: basePermissions,          // "alarms" lives here on MV3
      host_permissions: requiredHosts,
    };

    const mv2Permissions = {
      // On MV2, host patterns must be in "permissions"
      permissions: [...basePermissions, ...requiredHosts],
      optional_permissions: ['<all_urls>'],
    };

    return {
      name: 'Kitsunarr',
      description: 'Adds a one-click "Add to Sonarr" button to anime pages',
      ...(manifestVersion === 3 ? mv3Permissions : mv2Permissions),
      // action: {
      //   default_title: 'Kitsunarr Settings',
      //   default_popup: 'popup/index.html'
      // },
      options_ui: {
        page: 'options/index.html',
        open_in_tab: true,
      },
      browser_specific_settings: {
        gecko: {
          id: 'kitsunarr@local',
          strict_min_version: '109.0',
        },
      },
    };
  },
});
