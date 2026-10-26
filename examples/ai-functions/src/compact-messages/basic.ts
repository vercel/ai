import { parseJSON } from '@ai-sdk/provider-utils';
import {
  compactMessages,
  CompactionError,
  generateText,
  measureContext,
  type CompactionCheckpoint,
  type CompactionSummarizer,
  type ModelMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../lib/run';

// No credentials required: the summary model returns a deterministic handoff.
// Run: pnpm tsx src/compact-messages/basic.ts
run(async () => {
  const summaryModel = new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'text',
          text: 'Completed: reviewed the migration report. Keep identifiers intact. Remaining: verify the release and report the outcome.',
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 500,
          noCache: 500,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 30, text: 30, reasoning: undefined },
      },
      warnings: [],
    },
  });
  const summarize: CompactionSummarizer = {
    maxInputTokens: 2_000,
    maxOutputTokens: 200,
    execute: input => generateText({ model: summaryModel, ...input }),
  };
  type FrameworkMessage = ModelMessage & { kind?: string; id?: string };
  const messages: FrameworkMessage[] = [
    { role: 'user', kind: 'user', content: 'Review the migration report.' },
    { role: 'assistant', content: 'The migration report has been reviewed.' },
    {
      role: 'user',
      kind: 'user',
      id: 'current-request',
      content: `Keep identifiers intact.\n${'Report detail: release-42 passed.\n'.repeat(2_000)}\nVerify the release and report the outcome.`,
    },
    {
      role: 'user',
      kind: 'execution.continuation',
      content: 'Continue the current task.',
    },
  ];
  // Instructions/protected memory are measured, but only ordinary history is rewritten.
  const instructions =
    'Release assistant. Protected memory: release-42 is the target.';
  const context = await measureContext({ instructions, messages });
  const createMessage = (
    message: ModelMessage,
    purpose: 'checkpoint' | 'continuation',
  ): FrameworkMessage =>
    message.role === 'user'
      ? {
          ...message,
          kind:
            purpose === 'checkpoint'
              ? 'context.compaction'
              : 'execution.continuation',
        }
      : message;

  // Triggering belongs to the caller; this example deliberately invokes compaction.
  const compacted = await compactMessages({
    messages,
    context,
    targetInputTokens: 1_000,
    maxRecentTokens: 300,
    currentUserMessageIndex: 2,
    createMessage,
    summarize,
    onUsage: usage => console.log('Summary usage recorded:', usage.totalTokens),
  });
  console.log(
    'Whole-request tokens:',
    context.inputTokens,
    '→',
    compacted.inputTokensAfter,
  );
  console.log(
    'Current request after clipping:',
    compacted.messages.find(
      message => (message as FrameworkMessage).id === 'current-request',
    ),
  );

  // Store history and its checkpoint together. Reloading needs no object identity.
  type Conversation = {
    messages: ModelMessage[];
    checkpoint?: CompactionCheckpoint;
  };
  const saved = JSON.stringify({
    messages: compacted.messages,
    checkpoint: compacted.checkpoint,
  });
  const restored = (await parseJSON({
    text: saved,
  })) as unknown as Conversation;
  restored.messages.push({
    role: 'assistant',
    content: 'Release verification passed.',
  });
  const verdictRequest: FrameworkMessage = {
    role: 'user',
    kind: 'user',
    id: 'verdict-request',
    content: 'Give me the release verdict.',
  };
  restored.messages.push(verdictRequest);
  const refreshed = await compactMessages({
    ...restored,
    context: await measureContext({
      instructions,
      messages: restored.messages,
    }),
    targetInputTokens: 1_000,
    maxRecentTokens: 300,
    createMessage,
    summarize,
    reason: 'manual',
  });
  console.log('Refreshed checkpoint after JSON reload:', refreshed.checkpoint);
  console.log('Summary calls:', summaryModel.doGenerateCalls.length);

  // A full custom strategy needs no summarizer. Its result still must fit.
  const customContext = await measureContext({
    instructions,
    messages: refreshed.messages,
  });
  const latestUserIndex = refreshed.messages.findIndex(
    message => (message as FrameworkMessage).id === 'verdict-request',
  );
  const custom = {
    messages: refreshed.messages,
    context: customContext,
    currentUserMessageIndex: latestUserIndex,
    strategy: async (
      history: readonly ModelMessage[],
      ctx: { currentUserMessageIndex: number | null },
    ) => ({
      messages:
        ctx.currentUserMessageIndex === null
          ? []
          : [history[ctx.currentUserMessageIndex]],
    }),
  };
  const latestOnly = await compactMessages({
    ...custom,
    targetInputTokens: 500,
  });
  console.log(
    'Custom replacement (no model usage):',
    latestOnly.messages,
    latestOnly.usage,
  );
  try {
    await compactMessages({
      ...custom,
      targetInputTokens: customContext.fixedInputTokens + 1,
    });
  } catch (error) {
    if (!CompactionError.isInstance(error)) throw error;
    console.log('Too-small target rejected:', error.code);
  }
});
