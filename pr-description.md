## Summary

Adds a community provider documentation page for [ai-sdk-provider-copilot](https://github.com/nicobailon/ai-sdk-provider-copilot), which enables using GitHub Copilot models through the official [@github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk).

## Changes

- Added `content/providers/03-community-providers/45-copilot-cli.mdx`

## Provider Features

- ✅ `generateText()` and `streamText()` support
- ✅ Tool calling with custom Zod schemas
- ✅ Custom agents with system prompts
- ✅ BYOK (Bring Your Own Key) support
- ✅ MCP server integration
- ✅ Response caching
- ✅ Retry with exponential backoff
- ✅ OpenTelemetry integration
- ⚠️ Prompt-based `generateObject()` (no native JSON mode)

## Note

This provider requires the Copilot CLI to be running locally and will not work in serverless environments (Vercel, AWS Lambda, etc.) because the Copilot SDK spawns a local CLI process.

## Related

- NPM: https://www.npmjs.com/package/ai-sdk-provider-copilot
- GitHub: https://github.com/nicobailon/ai-sdk-provider-copilot
