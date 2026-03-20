import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import {
  generateText,
  ModelMessage,
  pruneMessages,
  stepCountIs,
  tool,
} from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const thinkingOptions = {
  anthropic: {
    thinking: { type: 'enabled', budgetTokens: 10000 },
  } satisfies AnthropicLanguageModelOptions,
};

function printMessages(messages: ModelMessage[]) {
  for (const msg of messages) {
    console.log(`  [${msg.role}]:`);
    if (typeof msg.content === 'string') {
      console.log(`    "${msg.content}"`);
    } else {
      for (const part of msg.content) {
        console.log(`    - type: ${part.type}`);
      }
    }
  }
}

run(async () => {
  // ── Part 1: Live multi-step agent loop ──
  // In a multi-step loop, intermediate assistant messages typically contain
  // reasoning + tool-call WITHOUT text. After pruning tool calls, these
  // become reasoning-only messages which Anthropic rejects.
  console.log('=== Part 1: Multi-step agent loop with thinking ===\n');

  const result = await generateText({
    model: 'anthropic/claude-opus-4.6',
    tools: {
      checkErrors: tool({
        description: 'Check for errors in an environment',
        inputSchema: z.object({
          environment: z.string().describe('The environment to check'),
        }),
        execute: async ({ environment }) => ({
          environment,
          errors: [],
          status: 'no errors found',
        }),
      }),
      getMetrics: tool({
        description: 'Get performance metrics for an environment',
        inputSchema: z.object({
          environment: z.string().describe('The environment to check'),
        }),
        execute: async ({ environment }) => ({
          environment,
          cpu: '23%',
          memory: '45%',
          latency: '120ms',
        }),
      }),
    },
    stopWhen: stepCountIs(5),
    providerOptions: thinkingOptions,
    prompt:
      'Check the production environment for errors, then get its performance metrics, and summarize your findings.',
  });

  console.log(`Completed in ${result.steps.length} steps.`);
  console.log('Response messages:');
  printMessages(result.response.messages);

  // Build conversation and prune
  const liveMessages: ModelMessage[] = [
    { role: 'user', content: 'Check prod and get metrics.' },
    ...result.response.messages,
    { role: 'user', content: 'Thanks! Now tell me a joke.' },
  ];

  console.log('\nBefore pruning:');
  printMessages(liveMessages);

  const livePruned = pruneMessages({
    messages: liveMessages,
    toolCalls: 'before-last-5-messages',
    reasoning: 'before-last-message',
    emptyMessages: 'remove',
  });

  console.log('\nAfter pruning:');
  printMessages(livePruned);

  const liveReasoningOnly = livePruned.filter(
    msg =>
      msg.role === 'assistant' &&
      typeof msg.content !== 'string' &&
      msg.content.length > 0 &&
      msg.content.every(part => part.type === 'reasoning'),
  );

  console.log(
    liveReasoningOnly.length > 0
      ? `\n⚠ BUG (live): ${liveReasoningOnly.length} assistant message(s) with ONLY reasoning parts.`
      : '\nNo reasoning-only messages from live test.',
  );

  // ── Part 2: Deterministic reproduction with hardcoded messages ──
  // This guarantees the bug regardless of model behavior by constructing
  // an assistant message with only reasoning + tool-call (no text).
  console.log('\n\n=== Part 2: Deterministic reproduction ===\n');

  const hardcodedMessages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Check the production environment for errors.',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'The user wants me to check for errors. I should use the checkErrors tool.',
          providerOptions: {
            anthropic: {
              signature: 'placeholder-signature',
            },
          },
        },
        {
          type: 'tool-call',
          toolCallId: 'tool_01',
          toolName: 'checkErrors',
          input: { environment: 'production' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool_01',
          toolName: 'checkErrors',
          output: {
            type: 'json',
            value: { environment: 'production', errors: [], status: 'ok' },
          },
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'The check came back clean. Let me tell the user.',
          providerOptions: {
            anthropic: {
              signature: 'placeholder-signature',
            },
          },
        },
        {
          type: 'text',
          text: 'No errors found in production!',
        },
      ],
    },
    {
      role: 'user',
      content: 'Great, now tell me a joke.',
    },
  ];

  console.log('Before pruning:');
  printMessages(hardcodedMessages);

  const hardcodedPruned = pruneMessages({
    messages: hardcodedMessages,
    toolCalls: 'before-last-5-messages',
    reasoning: 'before-last-message',
    emptyMessages: 'remove',
  });

  console.log('\nAfter pruning:');
  printMessages(hardcodedPruned);

  const hardcodedReasoningOnly = hardcodedPruned.filter(
    msg =>
      msg.role === 'assistant' &&
      typeof msg.content !== 'string' &&
      msg.content.length > 0 &&
      msg.content.every(part => part.type === 'reasoning'),
  );

  if (hardcodedReasoningOnly.length > 0) {
    console.log(
      `\n⚠ BUG CONFIRMED: ${hardcodedReasoningOnly.length} assistant message(s) with ONLY reasoning parts after pruning.`,
    );
    console.log('Attempting to send to Anthropic (expect 400 error)...\n');

    try {
      const followUp = await generateText({
        model: 'anthropic/claude-opus-4.6',
        messages: hardcodedPruned,
        providerOptions: thinkingOptions,
      });
      console.log('Unexpectedly succeeded:', followUp.text.slice(0, 200));
    } catch (error) {
      console.error('API call FAILED as expected:');
      console.error(error);
    }
  } else {
    console.log('\nNo reasoning-only messages — bug not reproduced.');
  }
});
