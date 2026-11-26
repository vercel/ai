# AI SDK - Policy-Based Tool Approvals

Policy-as-code authorization for AI SDK tool calls, powered by [Open Policy Agent](https://www.openpolicyagent.org/).

## Setup

```bash
npm i ai @ai-sdk/policy-opa @ai-sdk/anthropic @open-policy-agent/opa-wasm
```

## Usage

```ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { opaPolicy, wasmPolicyClient } from '@ai-sdk/policy-opa';
import { readFile } from 'node:fs/promises';

// 1. Load the compiled policy bundle.
const wasm = await readFile('./policy.wasm');
const client = await wasmPolicyClient({ wasm });

// 2. Build the toolApproval configuration.
const toolApproval = opaPolicy({
  client,
  path: 'agent/call/decision',
});

// 3. Pass it to generateText. Everything else is normal.
const result = await generateText({
  model: anthropic('claude-sonnet-5-5'),
  tools: { git, bash, queryLogs },
  toolApproval,
  prompt: 'find the failing test and push the fix',
});
```

See the [Policy-Based Tool Approvals documentation](https://ai-sdk.dev/docs/agents/policy-tool-approvals) for more information.
