---
title: Z.AI Provider
description: Learn how to use the Z.AI community provider to access GLM models through the Claude Code CLI and Anthropic-compatible HTTP surface.
---

# Z.AI Provider

The [ai-sdk-zai-provider](https://github.com/zai-dev/ai-sdk-zai-provider) community provider lets you reach Z.AI's GLM models through the Claude Code CLI plus an Anthropic-compatible HTTP client. It reuses the official Claude Code SDK under the hood, injects your Z.AI API key, and wires up the published MCP servers so you can mix CLI automations, deterministic HTTP calls, and custom-tool guardrails inside the Vercel AI SDK.

## Version Compatibility

| Provider Version | AI SDK Version | Status      | Branch                                                                          |
| ---------------- | -------------- | ----------- | ------------------------------------------------------------------------------- |
| 0.x              | v5             | Stable      | [`main`](https://github.com/zai-dev/ai-sdk-zai-provider/tree/main)              |
| -                | v4             | Unsupported | &mdash;                                                                          |

## Setup

The Z.AI provider ships as the `ai-sdk-zai-provider` module. Install the package that matches your AI SDK version:

### For AI SDK v5-beta (latest)

<Snippet text="pnpm add ai-sdk-zai-provider ai" dark />
<Snippet text="npm install ai-sdk-zai-provider ai" dark />
<Snippet text="yarn add ai-sdk-zai-provider ai" dark />
<Snippet text="bun add ai-sdk-zai-provider ai" dark />

<Note>
  The ai-sdk-zai-provider only supports AI SDK v5-beta and newer. Earlier
  versions are not compatible.
</Note>

## Provider Instance

You can import the default Claude Code provider instance `zaiClaudeCode` from `ai-sdk-zai-provider`:

```ts
import { zaiClaudeCode } from 'ai-sdk-zai-provider';
```

For a customized setup, import `createZaiClaudeCode` and pass your preferences:

```ts
import { createZaiClaudeCode } from 'ai-sdk-zai-provider';

const zaiClaudeCode = createZaiClaudeCode({
  includeDefaultAllowedTools: true,
  enableWebSearchMcp: true,
  enableWebReaderMcp: true,
  enableVisionMcp: true,
  customToolsOnly: {
    allowedTools: ['repo_search'],
    appendSystemPrompt: 'Never call Bash or Task.',
  },
  defaultSettings: {
    timeoutMs: 300_000,
  },
});
```

You can use the following optional settings to customize the Z.AI Claude Code provider instance:

- **apiKey** _string_

  Required. Explicit API key value. Defaults to `process.env.ZAI_API_KEY`.

- **anthropicBaseUrl** _string_

  Optional. Anthropic-compatible base URL for the Z.AI runtime. Defaults to `https://api.z.ai/api/anthropic`.

- **timeoutMs** _number_

  Optional. Timeout (ms) injected as `API_TIMEOUT_MS` for the Claude Code CLI. Defaults to `300000`.

- **modelMappings** _Record\<'opus' \| 'sonnet' \| 'haiku', string>_

  Optional. Override which GLM SKU each Claude alias maps to (defaults: `sonnet` → `glm-4.6`, `opus` → `glm-4.6`, `haiku` → `glm-4.5-air`).

- **includeDefaultAllowedTools** _boolean_

  Optional. Append the default CLI tools (`Bash`, `Read`, `Write`, etc.). Defaults to `true`.

- **enableWebSearchMcp** / **enableWebReaderMcp** / **enableVisionMcp** _boolean_

  Optional. Toggle the built-in MCP servers (Web Search Prime, Web Reader + `WebFetch`, and Z.AI Vision). Defaults to `true`.

- **visionCommand** _{ command: string; args?: string[]; env?: Record<string, string | undefined> }_

  Optional. Customize how the `zai-vision` MCP server launches (defaults to `npx -y @z_ai/mcp-server`).

- **customToolsOnly** _boolean \| CustomToolsOnlyOptions_

  Optional. Strip all CLI tools except your allowlist, block Bash/Task, and inject a guardrail prompt that forces Claude to stay inside your custom tools.

- **defaultSettings** _ClaudeCodeSettings_

  Optional. Pass through any `ai-sdk-provider-claude-code` defaults (system prompts, permissions, MCP overrides, etc.). They are merged with the Z.AI env wiring.

When you need HTTP parity or deterministic tool handoffs, import `zaiAnthropic`, `createZaiAnthropic`, and `forceCustomTools`:

```ts
import { forceCustomTools, zaiAnthropic } from 'ai-sdk-zai-provider';

const httpModel = zaiAnthropic('glm-4.6');

await forceCustomTools({
  model: zaiClaudeCode('glm-4.6'),
  tools,
  toolName: 'repo_search',
  toolInput: { query: 'supply chain' },
  messages,
});
```

## Language Models

You can create models that call GLM through the Claude Code CLI or the HTTP surface using the provider instance. Pass either a Claude alias (`'opus'`, `'sonnet'`, `'haiku'`) or a GLM SKU (`'glm-4.6'`, `'glm-4.5-air'`, etc.); aliases resolve to the matching GLM model:

```ts
const model = zaiClaudeCode('glm-4.6');
```

Z.AI exposes the following GLM models through the Claude Code provider:

- **glm-4.6**: Flagship reasoning model with extended thinking and MCP access
- **glm-4.5-air**: Fast, cost-efficient assistant for iterative edits
- **glm-4.5-flash**: Lightweight model tuned for quick automations and guardrail flows

### Example: Generate Text

You can use Z.AI language models with the `generateText` function:

```ts
import { generateText } from 'ai';
import { zaiClaudeCode } from 'ai-sdk-zai-provider';

const result = await generateText({
  model: zaiClaudeCode('glm-4.6'),
  prompt: 'Write a mitigation plan for leaked SSH keys.',
});
const text = await result.text;
```

Z.AI language models also work with `streamText`, `generateObject`, and `streamObject` (see [AI SDK Core](/docs/ai-sdk-core) for more details). Use `zaiAnthropic` if you need the HTTP-compatible surface for deterministic tool calls or telemetry alignment.

<Note>
  AI SDK v5 retrieves text responses as a promise via <code>await result.text</code>.
  Since ai-sdk-zai-provider only supports v5, always use this pattern.
</Note>

### Model Capabilities

All GLM aliases can analyze images and video streams when the `zai-vision` MCP server is enabled (the provider wires this up automatically unless disabled).

| Model           | Image Input (MCP) | Object Generation   | Tool Usage          | Tool Streaming      |
| --------------- | ----------------- | ------------------- | ------------------- | ------------------- |
| `glm-4.6`       | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |
| `glm-4.5-air`   | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |
| `glm-4.5-flash` | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> | <Check size={18} /> |

<Note>
  Tool usage/streaming is provided through Claude Code's built-in tools and MCP
  servers (Bash, Edit, WebFetch, Z.AI Vision, etc.). To register schema-based
  custom tools, use <code>forceCustomTools</code> or the <code>zaiAnthropic</code> HTTP helper for
  deterministic invocation.
</Note>

## Authentication

The Z.AI provider uses your Z.AI API key with the Claude Code CLI. Export `ZAI_API_KEY` (or pass `apiKey`) so the provider can rewrite the CLI environment:

```bash
npm install -g @anthropic-ai/claude-code
export ZAI_API_KEY="your-zai-api-key"
claude --version # verify the CLI is reachable
```

You do not need to run `claude login` when supplying `ZAI_API_KEY`. The CLI reads the injected `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` that point toward Z.AI's deployment. The HTTP helper also relies on the same key (or `ZAI_HTTP_FALLBACK_MODEL` if you want to override the Claude-compatible fallback).

## Built-in Tools

Z.AI ships several Claude Code tools and MCP servers that are enabled by default:

- **Bash / Task / Read / Write / Edit / LS / Grep / Glob / TodoRead / TodoWrite**
- **Web Search Prime MCP**: Authenticated web search via `mcp__web-search-prime__webSearchPrime`
- **Web Reader MCP + WebFetch**: Fetch and summarize arbitrary URLs
- **Z.AI Vision MCP**: Analyze images and videos through `@z_ai/mcp-server`
- **Custom allowlists/denylists**: Control access using `allowedTools`, `disallowedTools`, or `customToolsOnly`

Use `customToolsOnly` to strip Bash/Task entirely while keeping your own MCP or HTTP tools in charge.

## Extended Thinking

GLM Opus inherits Claude 4's extended thinking support. Provide an `AbortController` with up to a 10-minute timeout when you let the model reason for longer periods:

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

try {
  const { text } = await generateText({
    model: zaiClaudeCode('glm-4.6'),
    prompt: 'Lay out a full incident response plan for a supply-chain compromise.',
    abortSignal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
```

## Requirements

- Node.js 18 or higher
- Claude Code CLI installed globally (`npm install -g @anthropic-ai/claude-code`)
- `ZAI_API_KEY` set (and optionally `ZAI_HTTP_FALLBACK_MODEL` for HTTP overrides)
- Access to Z.AI MCP servers (`@z_ai/mcp-server` is auto-installed via `npx`)
