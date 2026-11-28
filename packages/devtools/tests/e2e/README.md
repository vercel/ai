# Viewer contrast reproduction

The `dark controls, disclosure icons, grid lines and tooltips are distinguishable`
test in `theme.e2e.test.ts` is a deterministic reproduction for #17567. It uses
mocked API responses with a tool definition, tool call/result, token usage, and
provider error. No API key, paid provider call, or existing trace database is
needed. This is a viewer-only regression, so the browser fixture replaces a
live-provider example.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm --filter @ai-sdk/devtools test:e2e
```

For interactive visual inspection:

```sh
pnpm --filter @ai-sdk/devtools build:client
pnpm --filter @ai-sdk/devtools exec playwright test --debug -g 'dark controls'
```

Use the Playwright inspector to step through the test and inspect:

1. The selected run's expanded step: the disclosure icon is on the left and
   the available-tool and Usage controls have visible borders and filled surfaces.
2. Available Tools: opening `lookupWeather` rotates its left-hand disclosure
   icon downward and reveals its description and schema.
3. Usage: the drawer displays readable token cards and JSON. Keyboard Enter
   opens each drawer, and Escape closes it.
4. Timeline: horizontal row separators and vertical tick lines remain visible.
5. The token-usage tooltip: its opaque raised background and border distinguish
   it from the underlying page.

Wait for drawer and tooltip animations to finish before taking screenshots.
The other tests cover light-theme compatibility, text/focus contrast, and media
previews. The contrast reproduction itself runs only in the default dark theme.
