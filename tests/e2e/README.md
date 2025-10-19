# End-to-end tests

The Playwright suite defaults to headless Chromium runs, including in CI. To observe
browser interactions locally, explicitly request a headful session:

```bash
PW_HEADFUL=1 npm run test:e2e
```

Keeping the default headless mode avoids CI crashes on environments without a display
server. Export `PW_HEADFUL=1` only when debugging locally or when a headed browser is
required.
