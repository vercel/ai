import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, type ModelMessage, stepCountIs, tool } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const issueSignal =
  'ISSUE_22432_REPRODUCED: failed tool-search errors cannot be replayed on the next step or later turn';

const initialPrompt =
  'Use the regex tool search with the invalid pattern "[" and then call continue_tool.';

async function readFixture(name: string): Promise<unknown> {
  const fixturePath = path.resolve(
    process.cwd(),
    '../../packages/anthropic/src/__fixtures__',
    name,
  );
  return JSON.parse(await fs.readFile(fixturePath, 'utf8'));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestHasToolSearchErrorResult(body: unknown): boolean {
  if (body == null || typeof body !== 'object' || !('messages' in body)) {
    return false;
  }

  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some(message => {
    if (
      message == null ||
      typeof message !== 'object' ||
      !('content' in message) ||
      !Array.isArray(message.content)
    ) {
      return false;
    }

    return message.content.some(
      (part: unknown) =>
        part != null &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'tool_search_tool_result' &&
        'content' in part &&
        part.content != null &&
        typeof part.content === 'object' &&
        'type' in part.content &&
        part.content.type === 'tool_search_tool_result_error' &&
        'error_code' in part.content &&
        part.content.error_code === 'invalid_tool_input',
    );
  });
}

async function createReplayFetch({
  includeInitialResponse,
}: {
  includeInitialResponse: boolean;
}) {
  const firstFixture = await readFixture(
    'anthropic-tool-search-error-step-1.1.json',
  );
  const secondFixture = await readFixture(
    'anthropic-tool-search-error-step-2.1.json',
  );
  let requestCount = 0;

  return {
    get requestCount() {
      return requestCount;
    },
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestCount++;

      if (includeInitialResponse && requestCount === 1) {
        return jsonResponse(firstFixture);
      }

      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      if (requestHasToolSearchErrorResult(requestBody)) {
        return jsonResponse(secondFixture);
      }

      return jsonResponse(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message:
              '`tool_search_tool_regex` tool use without a corresponding `tool_search_tool_result` block immediately after it',
          },
        },
        400,
      );
    },
  };
}

function createTools(kind: 'regex' | 'bm25') {
  return {
    toolSearch:
      kind === 'regex'
        ? createAnthropic().tools.toolSearchRegex_20251119()
        : createAnthropic().tools.toolSearchBm25_20251119(),
    deferred_alpha: tool({
      description: 'A deferred operation',
      inputSchema: z.object({}),
      providerOptions: { anthropic: { deferLoading: true } },
    }),
    continue_tool: tool({
      description: 'Continue after the failed search',
      inputSchema: z.object({ value: z.string() }),
      execute: async () => ({ ok: true }),
    }),
  };
}

async function runAutomaticNextStep(): Promise<string | undefined> {
  const replay = await createReplayFetch({ includeInitialResponse: true });
  const anthropic = createAnthropic({
    apiKey: 'reproduction-key',
    fetch: replay.fetch,
  });

  try {
    await generateText({
      model: anthropic('claude-sonnet-5-5'),
      prompt: initialPrompt,
      tools: createTools('regex'),
      stopWhen: stepCountIs(2),
    });
    return undefined;
  } catch {
    if (replay.requestCount === 2) {
      return 'automatic next step failed after error-json result was dropped';
    }
    throw new Error(
      `Unexpected automatic-step failure after ${replay.requestCount} requests`,
    );
  }
}

async function getRecordedHistory(): Promise<ModelMessage[]> {
  const replay = await createReplayFetch({ includeInitialResponse: true });
  const anthropic = createAnthropic({
    apiKey: 'reproduction-key',
    fetch: replay.fetch,
  });
  const firstStep = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    prompt: initialPrompt,
    tools: createTools('regex'),
    stopWhen: stepCountIs(1),
  });

  return [
    { role: 'user', content: initialPrompt },
    ...firstStep.response.messages,
  ];
}

async function runLaterTurn({
  history,
  kind,
  persistedJson,
}: {
  history: ModelMessage[];
  kind: 'regex' | 'bm25';
  persistedJson: boolean;
}): Promise<string | undefined> {
  const replay = await createReplayFetch({ includeInitialResponse: false });
  const anthropic = createAnthropic({
    apiKey: 'reproduction-key',
    fetch: replay.fetch,
  });
  const replayHistory = structuredClone(history);

  for (const message of replayHistory) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part.type === 'tool-call' && part.toolName === 'toolSearch') {
        part.input =
          kind === 'regex' ? { pattern: '[' } : { query: 'invalid input' };
      }

      if (
        persistedJson &&
        part.type === 'tool-result' &&
        part.toolName === 'toolSearch' &&
        part.output.type === 'error-json'
      ) {
        part.output = { type: 'json', value: part.output.value };
      }
    }
  }

  try {
    await generateText({
      model: anthropic('claude-sonnet-5-5'),
      messages: [
        ...replayHistory,
        { role: 'user', content: 'What happened in the failed search?' },
      ],
      tools: createTools(kind),
    });
    return undefined;
  } catch {
    if (persistedJson && replay.requestCount === 0) {
      return `${kind} later turn failed validation for persisted json error`;
    }
    if (!persistedJson && replay.requestCount === 1) {
      return `${kind} later turn failed because error-json result was dropped`;
    }
    throw new Error(
      `Unexpected ${kind} later-turn failure after ${replay.requestCount} requests`,
    );
  }
}

async function main() {
  const history = await getRecordedHistory();
  const failures = (
    await Promise.all([
      runAutomaticNextStep(),
      runLaterTurn({ history, kind: 'regex', persistedJson: false }),
      runLaterTurn({ history, kind: 'regex', persistedJson: true }),
      runLaterTurn({ history, kind: 'bm25', persistedJson: true }),
    ])
  ).filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    console.error(failures.map(failure => `- ${failure}`).join('\n'));
    throw new Error(issueSignal);
  }

  console.log('Tool-search error results replayed successfully.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
