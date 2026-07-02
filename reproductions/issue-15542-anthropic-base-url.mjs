#!/usr/bin/env node

/**
 * Reproduction for vercel/ai issue #15542.
 *
 * This intentionally uses Anthropic's official SDK convention for
 * ANTHROPIC_BASE_URL: the bare API host without /v1.
 *
 * Expected on the buggy implementation:
 *   AI_APICallError: Not Found
 *   url: https://api.anthropic.com/messages
 *
 * Run from the repository root:
 *   ANTHROPIC_API_KEY=sk-ant-... node reproductions/issue-15542-anthropic-base-url.mjs
 *
 * The script exits with status 1 when the bug is reproduced, so it can be used
 * as a failing reproduction artifact.
 */

import assert from 'node:assert/strict';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing required ANTHROPIC_API_KEY environment variable.');
  process.exit(2);
}

// Simulate Claude Code / Cursor child-process environment injection.
// This must be set before importing @ai-sdk/anthropic because the default
// provider instance reads ANTHROPIC_BASE_URL during module initialization.
process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

const [{ anthropic }, { APICallError, generateText }] = await Promise.all([
  import('../packages/anthropic/dist/index.js'),
  import('../packages/ai/dist/index.js'),
]);

try {
  await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    prompt: 'hi',
    maxOutputTokens: 1,
  });

  console.log('Could not reproduce: request unexpectedly succeeded.');
} catch (error) {
  assert.equal(APICallError.isInstance(error), true);
  assert.equal(error.statusCode, 404);
  assert.equal(error.url, 'https://api.anthropic.com/messages');

  console.error('Reproduced issue #15542: @ai-sdk/anthropic called wrong URL.');
  console.error(`Observed error: ${error.name}: ${error.message}`);
  console.error(`Observed URL: ${error.url}`);
  console.error(`Observed status: ${error.statusCode}`);
  process.exit(1);
}
