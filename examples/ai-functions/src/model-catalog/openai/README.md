# OpenAI catalog audit

The audit enumerates **every field under `capabilities` for every model in
`openaiModelCatalog`**. Before network work it requires an implemented SDK probe
for every field. Adding a capability without a probe fails the audit. The coverage
test applies this rule to the entire catalog, including non-language models.
The production catalog is never modified.

Build local packages from the repository root, then enter the examples package:

```sh
pnpm exec turbo build --filter=ai... --filter=@ai-sdk/openai...
cd examples/ai-functions
```

Run **every capability probe for every catalog model**, plus model-page checks:

```sh
pnpm tsx src/model-catalog/openai/check-capabilities.ts --live
```

Live mode uses `OPENAI_API_KEY` from the environment or this package's `.env` and
makes billable requests, including image count boundary tests. Speech-based probes
generate a short PCM fixture once through `generateSpeech`. WebRTC probes use
headless Chromium through the repository's Playwright installation. Install it
with `pnpm exec playwright install chromium` from the repository root if needed.
No microphone or manual SDP input is required.

Repeat `--model` to select IDs. `--probe` matches a substring of a probe name:

```sh
pnpm tsx src/model-catalog/openai/check-capabilities.ts --live --model gpt-6.2-astra
pnpm tsx src/model-catalog/openai/check-capabilities.ts --live --model gpt-4.1-mini --probe asyncTools
```

| Catalog section | SDK probes |
| --- | --- |
| Language | Image/audio input, structured outputs, function calling and streaming, reasoning support and every effort including rejected efforts, sampling at default/none/active reasoning, async tools, service tiers, cache TTLs/retention, both configuration-update carriers, and every endpoint-specific flag |
| Embedding | Default and custom dimensions |
| Image | Every enumerated size or custom-size samples, file input, masks, counts at the limit and one above it in a single provider API call |
| Speech | Instructions |
| Transcription | REST transcription, duration, segments, language, streaming, and every streaming delay value |
| Speech translation | Translated audio, translated text, source transcript |
| Realtime | Conversation semantics, WebSocket/WebRTC transports, server/client-secret WebSocket and WebRTC connections |

Scenarios include supported and unsupported declarations. To avoid testing the
catalog against itself, negative cases blocked by the SDK can use another SDK
encoding policy while retaining the actual API target model. The report identifies
that policy when used. Transcription similarly routes only the model ID in SDK
WebSocket messages. Capability parameters always come from SDK options; they are
never injected into raw API requests. Guards require both the setting and its
reasoning context to actually be sent.

Omit `--live` for **documentation only**, without model calls or an API key:

```sh
pnpm tsx src/model-catalog/openai/check-capabilities.ts
```

This reads each model's Markdown page and compares represented modalities,
features, reasoning metadata and endpoints. It flags **every listed feature and
built-in tool with no catalog field**, including explicitly unsupported features.
API-only fields remain visible with an instruction to use `--live`. Missing text
is never interpreted as unsupported; redirects to another model are unverified.

- `MATCH`: the declarations agree; supported and unsupported capabilities can match.
- `MISMATCH`: the sources contradict each other.
- `MISSING`: a model-page feature/tool has no catalog field.
- `UNVERIFIED`: insufficient evidence, such as model access, unavailable runtime
  dependencies, an unrelated API error, or an option the SDK cannot encode.
  This never counts as a successful assertion.

These are SDK/API acceptance and output checks, not semantic quality or cache-hit
benchmarks. Unknown/conditional declarations can remain unverified. Request-encoding
configuration and the separate `providerOptions` inventory are not capability fields.

Exit codes: `0` for matches only, `1` for discrepancies/missing fields/setup or
coverage errors, and `2` for unverified checks without discrepancies. A filtered
run does not imply that excluded probes were verified.
