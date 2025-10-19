# End-to-end testing

Kitsunarr's Playwright suite loads the MV3 Chromium extension in a persistent profile. Chromium
currently **does not support running MV3 extensions in headless mode**, so the tests must run
headful. When running in environments without a display (for example CI), wrap the Playwright
command in a virtual display such as `xvfb-run`:

```bash
xvfb-run --auto-servernum -- npm run test:e2e
```

The test harness will throw if headless mode is requested to avoid silent failures. Local runs can
execute `npm run test:e2e` directly; Playwright defaults to launching Chromium with a visible window.
