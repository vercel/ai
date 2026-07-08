# Harness ACP / Grok / Cursor (staging for upstream PR)

Packages added on branch `feat/harness-acp-grok-cursor`:

| Package | Description |
|---------|-------------|
| `@ai-sdk/harness-acp` | Generic ACP stdio sandbox harness |
| `@ai-sdk/harness-grok` | Grok Build (`grok agent stdio`) |
| `@ai-sdk/harness-cursor` | Cursor sandbox (`agent acp`) |

Source of truth for early development: [ai-sdk-harnesses](https://github.com/akvilander/ai-sdk-harnesses) (`@akvilander/ai-sdk-harness-*` on npm staging).

## Before opening PR to vercel/ai

- [x] Add changesets (`pnpm changeset`) — patch for each new package
- [x] Add provider docs under `content/providers/02-ai-sdk-harnesses`
- [x] Add harness-adapters table entry
- [x] Run `pnpm update-references` at monorepo root
- [x] `pnpm build` + `pnpm test` in each package
- [x] Open RFC issue linking production validation (personal-assistant coder PM) — [#16956](https://github.com/vercel/ai/issues/16956)
- [x] Draft PR — [#16957](https://github.com/vercel/ai/pull/16957) (ready to mark after RFC ACK)

## Out of scope (follow-up)

- `@ai-sdk/harness-cursor-cloud` for `@cursor/sdk` (Pi-style host adapter)
- Replay/rerun resume ladder parity with `harness-codex`