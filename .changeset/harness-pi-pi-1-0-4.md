---
'@ai-sdk/harness-pi': patch
---

chore(harness-pi): run on Pi 1.0.4

`@earendil-works/pi-coding-agent` moves from `^0.85.1` to `^1.0.4` and `@earendil-works/pi-ai` from `0.74.2` to `1.0.4`. The harness settings and stream are unchanged, and `mcpServers` are still served by `pi-mcp-adapter`. What a harness user notices comes from Pi itself: the model catalog is Pi 1.0.4's (Claude Opus 5.5, Claude Sonnet 5.5 and GPT-6.x through the gateway), the Azure provider id in `providers` is `azure` instead of `azure-openai-responses`, extension factories get Pi's 1.0 tool API (`exposure`, `namespace`, `ctx.executeTool()`, `pi.registerMcpServer()`), and `pi-ai` 1.0.4 brings the Bedrock, OpenAI and Google SDKs along as regular dependencies.
