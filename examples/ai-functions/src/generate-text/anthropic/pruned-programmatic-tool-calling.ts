import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, generateText, pruneMessages, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

// Pass code_execution_20260120 to exercise the newer caller version.
const callerType =
  process.argv[2] === 'code_execution_20260120'
    ? 'code_execution_20260120'
    : 'code_execution_20250825';

run(async () => {
  // Reproduce #12504: conversion splits the assistant message at step boundaries,
  // and pruning removes the code execution source while retaining its caller.
  const messages = await convertToModelMessages([
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Look up AAPL and calculate 100 shares.' }],
    },
    {
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-code_execution',
          toolCallId: 'srvtoolu_source',
          state: 'output-available',
          providerExecuted: true,
          input: {
            type: 'programmatic-tool-call',
            code: 'price = await lookup({"ticker": "AAPL"})',
          },
          output: {
            type: 'code_execution_result',
            stdout: '',
            stderr: '',
            return_code: 0,
            content: [],
          },
        },
        { type: 'step-start' },
        {
          type: 'tool-lookup',
          toolCallId: 'toolu_lookup',
          state: 'output-available',
          input: { ticker: 'AAPL' },
          output: { price: 185.42 },
          callProviderMetadata: {
            anthropic: {
              caller: { type: callerType, toolId: 'srvtoolu_source' },
            },
          },
        },
        { type: 'step-start' },
        { type: 'text', text: 'The price is $185.42.' },
        { type: 'step-start' },
        { type: 'text', text: '100 shares cost $18,542.' },
        { type: 'step-start' },
        { type: 'text', text: 'Calculation complete.' },
      ],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: 'What was the price of AAPL?' }],
    },
  ]);

  const prunedMessages = pruneMessages({
    messages,
    toolCalls: 'before-last-5-messages',
  });
  const retainedCalls = prunedMessages.flatMap(message =>
    typeof message.content === 'string'
      ? []
      : message.content.filter(part => part.type === 'tool-call'),
  );
  assert.ok(!retainedCalls.some(part => part.toolCallId === 'srvtoolu_source'));
  assert.ok(retainedCalls.some(part => part.toolCallId === 'toolu_lookup'));

  const result = await generateText({
    model: anthropic('claude-opus-4-5'),
    messages: prunedMessages,
    maxOutputTokens: 64,
    tools: {
      code_execution:
        callerType === 'code_execution_20260120'
          ? anthropic.tools.codeExecution_20260120()
          : anthropic.tools.codeExecution_20250825(),
      lookup: tool({
        description: 'Look up a stock ticker price.',
        inputSchema: z.object({ ticker: z.string() }),
        execute: async () => ({ price: 185.42 }),
        providerOptions: { anthropic: { allowedCallers: [callerType] } },
      }),
    },
  });

  console.log(result.text);
  console.log('Warnings:', result.warnings);
});
