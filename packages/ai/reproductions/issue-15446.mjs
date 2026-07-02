#!/usr/bin/env node
import assert from 'node:assert/strict';
import { generateText, registerTelemetry } from '../dist/index.js';
import { MockLanguageModelV4 } from '../dist/test/index.js';

// Reproduction for https://github.com/vercel/ai/issues/15446
// Reported bug: generateText with experimental_telemetry: { isEnabled: false }
// throws: TypeError: Cannot read properties of undefined (reading 'total').

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const model = new MockLanguageModelV4({
  doGenerate: {
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
    content: [{ type: 'text', text: 'Hello from issue 15446' }],
  },
});

let globalTelemetryCalls = 0;
registerTelemetry({
  onStart: () => {
    globalTelemetryCalls += 1;
    throw new Error('disabled telemetry unexpectedly called onStart');
  },
  onLanguageModelCallEnd: () => {
    globalTelemetryCalls += 1;
    throw new Error(
      'disabled telemetry unexpectedly called onLanguageModelCallEnd',
    );
  },
  executeLanguageModelCall: async () => {
    globalTelemetryCalls += 1;
    throw new Error(
      'disabled telemetry unexpectedly called executeLanguageModelCall',
    );
  },
});

const result = await generateText({
  model,
  prompt: 'Say hello',
  experimental_telemetry: { isEnabled: false },
});

assert.equal(result.text, 'Hello from issue 15446');
assert.deepEqual(result.usage, {
  inputTokens: 3,
  inputTokenDetails: {
    noCacheTokens: 3,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokens: 10,
  outputTokenDetails: { textTokens: 10, reasoningTokens: undefined },
  totalTokens: 13,
});
assert.equal(
  globalTelemetryCalls,
  0,
  'experimental_telemetry.isEnabled=false should suppress global telemetry',
);

console.log(
  'issue-15446 scenario completed without Cannot read properties of undefined (reading total)',
);
