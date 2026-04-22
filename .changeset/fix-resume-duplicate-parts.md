---
"ai": patch
---

fix(ui): prevent duplicate text/reasoning parts on stream resume

When `resumeStream` replays a buffered `UIMessageStream` against an assistant message whose parts were persisted from the first attempt, the `text-start` and `reasoning-start` handlers no longer push duplicate parts — they reuse the existing ones via FIFO queues pre-indexed in `createStreamingUIMessageState`. Fixes UI flashes / duplicate content on network blips, lifecycle aborts, or proxy timeouts.
