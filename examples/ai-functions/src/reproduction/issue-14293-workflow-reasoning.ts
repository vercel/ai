import { WorkflowAgent } from '@ai-sdk/workflow';
import { jsonSchema, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

const reasoningText = 'I should inspect the configuration before answering.';
const assistantText = 'I will inspect the configuration.';
const providerMetadata = {
  anthropic: { signature: 'signature-14293' },
  openai: { reasoningEncryptedContent: 'encrypted-reasoning-14293' },
};

async function main() {
  let callCount = 0;

  const model = new MockLanguageModelV4({
    doStream: async () => {
      callCount++;

      if (callCount === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'reasoning-start' as const,
              id: 'reasoning-1',
              providerMetadata,
            },
            {
              type: 'reasoning-delta' as const,
              id: 'reasoning-1',
              delta: reasoningText,
              providerMetadata,
            },
            {
              type: 'reasoning-end' as const,
              id: 'reasoning-1',
              providerMetadata,
            },
            { type: 'text-start' as const, id: 'text-1' },
            {
              type: 'text-delta' as const,
              id: 'text-1',
              delta: assistantText,
            },
            { type: 'text-end' as const, id: 'text-1' },
            {
              type: 'tool-call' as const,
              toolCallId: 'read-config-1',
              toolName: 'readConfig',
              input: '{}',
              providerMetadata: {
                openai: {
                  itemId: 'function-call-item-14293',
                  reasoningEncryptedContent: 'encrypted-reasoning-14293',
                },
              },
            },
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool_calls',
              },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 3,
                  text: 2,
                  reasoning: 1,
                },
              },
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text-2' },
          {
            type: 'text-delta' as const,
            id: 'text-2',
            delta: 'Done.',
          },
          { type: 'text-end' as const, id: 'text-2' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
              inputTokens: {
                total: 4,
                noCache: 4,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          },
        ]),
      };
    },
  });

  const streamedParts: unknown[] = [];
  const result = await new WorkflowAgent({
    model,
    tools: {
      readConfig: tool({
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => ({ setting: 'enabled' }),
      }),
    },
  }).stream({
    messages: [{ role: 'user', content: 'Check the configuration.' }],
    writable: new WritableStream({
      write(part) {
        streamedParts.push(part);
      },
    }),
  });

  if (model.doStreamCalls.length !== 2) {
    throw new Error(
      `Reproduction setup failed: expected 2 model calls, received ${model.doStreamCalls.length}.`,
    );
  }

  const secondPrompt = model.doStreamCalls[1]?.prompt ?? [];
  const priorAssistantMessage = secondPrompt.find(
    message => message.role === 'assistant',
  );
  const priorAssistantContent =
    priorAssistantMessage != null &&
    Array.isArray(priorAssistantMessage.content)
      ? priorAssistantMessage.content
      : [];

  const replayedText = priorAssistantContent
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  if (!replayedText.includes(assistantText)) {
    throw new Error(
      'Unexpected main-branch regression: assistant text was not replayed.',
    );
  }

  const replayedReasoning = priorAssistantContent.filter(
    part => part.type === 'reasoning',
  );
  const replayedReasoningText = replayedReasoning
    .map(part => part.text)
    .join('');
  const replayedProviderOptions = replayedReasoning
    .map(part => part.providerOptions)
    .find(options => options != null);

  const capturedReasoning = result.steps[0]?.reasoning;
  const streamedReasoningStart = streamedParts.find(
    (part): part is { type: string; providerMetadata?: unknown } =>
      typeof part === 'object' &&
      part != null &&
      'type' in part &&
      part.type === 'reasoning-start',
  );

  console.log(
    JSON.stringify(
      {
        streamedReasoningStartProviderMetadata:
          streamedReasoningStart?.providerMetadata,
        capturedReasoning,
        replayedAssistantContent: priorAssistantContent,
      },
      null,
      2,
    ),
  );

  const replayedAnthropicOptions = replayedProviderOptions?.anthropic as
    | Record<string, unknown>
    | undefined;
  const replayedOpenAIOptions = replayedProviderOptions?.openai as
    | Record<string, unknown>
    | undefined;
  const preservedProviderMetadata =
    replayedAnthropicOptions?.signature ===
      providerMetadata.anthropic.signature &&
    replayedOpenAIOptions?.reasoningEncryptedContent ===
      providerMetadata.openai.reasoningEncryptedContent;

  if (replayedReasoningText !== reasoningText || !preservedProviderMetadata) {
    console.error(
      'ISSUE_14293_REPRODUCED: second WorkflowAgent prompt omitted reasoning content and provider metadata.',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
