import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import {
  createGateway,
  generateText,
  pruneMessages,
  type ModelMessage,
} from 'ai';

const reportedModel = 'claude-sonnet-4-20250514';
const supportedModel = 'claude-sonnet-4-6';
const initialUserText =
  'Call checkSandboxErrors now. Do not answer with text; use the tool.';

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface RecordedAnthropicResponse {
  content: Array<ThinkingBlock | ToolUseBlock>;
}

interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

async function readRecordedResponse(): Promise<RecordedAnthropicResponse> {
  const fixtureUrl = new URL(
    '../../../../packages/anthropic/src/__fixtures__/issue-13430-thinking-tool-call.json',
    import.meta.url,
  );
  const fixture = await readFile(fileURLToPath(fixtureUrl), 'utf8');
  return JSON.parse(fixture) as RecordedAnthropicResponse;
}

async function postAnthropic(body: Record<string, unknown>) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') {
    throw new Error('Expected a JSON string request body.');
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function findReasoningOnlyAssistant(messages: ModelMessage[]) {
  return messages.find(
    message =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.length > 0 &&
      message.content.every(part => part.type === 'reasoning'),
  );
}

async function main() {
  const retiredModelResult = await postAnthropic({
    model: reportedModel,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply OK.' }],
  });
  assert.equal(retiredModelResult.status, 404);
  assert.equal(
    (retiredModelResult.body as unknown as AnthropicErrorResponse).error.type,
    'not_found_error',
  );

  const recordedResponse = await readRecordedResponse();
  const thinkingBlock = recordedResponse.content.find(
    (part): part is ThinkingBlock => part.type === 'thinking',
  );
  const toolUseBlock = recordedResponse.content.find(
    (part): part is ToolUseBlock => part.type === 'tool_use',
  );
  assert.ok(thinkingBlock);
  assert.ok(toolUseBlock);

  const messages: ModelMessage[] = [
    { role: 'user', content: initialUserText },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: thinkingBlock.thinking,
          providerOptions: {
            anthropic: { signature: thinkingBlock.signature },
          },
        },
        {
          type: 'tool-call',
          toolCallId: toolUseBlock.id,
          toolName: toolUseBlock.name,
          input: JSON.stringify(toolUseBlock.input),
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: toolUseBlock.id,
          toolName: toolUseBlock.name,
          output: { type: 'text', value: 'No errors found.' },
        },
      ],
    },
    { role: 'user', content: 'Conversation continued.' },
    { role: 'assistant', content: 'Understood.' },
    { role: 'user', content: 'Topic two.' },
    { role: 'assistant', content: 'Noted.' },
    { role: 'user', content: 'Topic three.' },
    { role: 'assistant', content: 'Okay.' },
    { role: 'user', content: 'Reply with exactly ACK.' },
  ];

  const pruned = pruneMessages({
    messages,
    toolCalls: [
      {
        type: 'before-last-5-messages',
        tools: ['checkSandboxErrors'],
      },
    ],
    emptyMessages: 'remove',
  });

  const reasoningOnlyAssistant = findReasoningOnlyAssistant(pruned);
  assert.ok(
    reasoningOnlyAssistant,
    'pruneMessages should expose the reported reasoning-only intermediate state',
  );
  assert.equal(
    pruned.some(
      message =>
        Array.isArray(message.content) &&
        message.content.some(
          part => part.type === 'tool-call' || part.type === 'tool-result',
        ),
    ),
    false,
  );

  const directResult = await postAnthropic({
    model: supportedModel,
    max_tokens: 2048,
    thinking: { type: 'enabled', budget_tokens: 1024 },
    messages: [
      { role: 'user', content: initialUserText },
      { role: 'assistant', content: [thinkingBlock] },
      { role: 'user', content: 'Conversation continued.' },
      { role: 'assistant', content: 'Understood.' },
      { role: 'user', content: 'Topic two.' },
      { role: 'assistant', content: 'Noted.' },
      { role: 'user', content: 'Topic three.' },
      { role: 'assistant', content: 'Okay.' },
      { role: 'user', content: 'Reply with exactly ACK.' },
    ],
  });
  assert.equal(
    directResult.status,
    200,
    `direct Anthropic rejected reasoning-only history: ${JSON.stringify(directResult.body)}`,
  );

  let anthropicRequestBody: Record<string, unknown> | undefined;
  const anthropic = createAnthropic({
    fetch: async (url, options) => {
      anthropicRequestBody = parseRequestBody(options?.body);
      return fetch(url, options);
    },
  });

  await generateText({
    model: anthropic(supportedModel),
    messages: pruned,
    maxOutputTokens: 2048,
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 1024 },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  assert.ok(anthropicRequestBody);
  const anthropicMessages = anthropicRequestBody.messages as Array<{
    role: string;
    content: unknown;
  }>;
  assert.ok(
    anthropicMessages.some(
      message =>
        message.role === 'assistant' &&
        Array.isArray(message.content) &&
        message.content.length === 1 &&
        message.content[0]?.type === 'thinking',
    ),
    'AI SDK Anthropic request should contain the reasoning-only assistant message',
  );

  let gatewayRequestBody: Record<string, unknown> | undefined;
  const gateway = createGateway({
    fetch: async (url, options) => {
      gatewayRequestBody = parseRequestBody(options?.body);
      return fetch(url, options);
    },
  });

  await generateText({
    model: gateway('anthropic/claude-sonnet-4.6'),
    messages: pruned,
    maxOutputTokens: 2048,
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 1024 },
      },
    },
  });

  assert.ok(gatewayRequestBody);
  const gatewayPrompt = gatewayRequestBody.prompt as ModelMessage[];
  assert.ok(
    findReasoningOnlyAssistant(gatewayPrompt),
    'AI Gateway request should contain the reasoning-only assistant message',
  );

  console.log(
    'Issue #13430 could not be reproduced: pruneMessages left a reasoning-only assistant message, but direct Anthropic, @ai-sdk/anthropic, and AI Gateway all accepted it.',
  );
  console.log(
    `The exact reported model ${reportedModel} is retired and returned HTTP 404; ${supportedModel} was used for provider checks.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
