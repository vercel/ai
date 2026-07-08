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
- [ ] `pnpm build` + `pnpm test` in each package
- [ ] Open RFC issue linking production validation (personal-assistant coder PM)

## Out of scope (follow-up)

- `@ai-sdk/harness-cursor-cloud` for `@cursor/sdk` (Pi-style host adapter)
- Replay/rerun resume ladder parity with `harness-codex`