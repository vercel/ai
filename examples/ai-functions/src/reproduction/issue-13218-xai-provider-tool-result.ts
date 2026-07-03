import 'dotenv/config';

import { xai } from '@ai-sdk/xai';
import {
  APICallError,
  LoadAPIKeyError,
  streamText,
  type TextStreamPart,
} from 'ai';

const ISSUE_DESCRIPTION =
  'vercel/ai#13218: xAI Responses provider-executed web_search streams a tool-call but no tool-result.';

type ToolEvents = {
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    providerExecuted?: boolean;
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    providerExecuted?: boolean;
    output: unknown;
  }>;
  inputEvents: string[];
};

function isAccessBlocker(error: unknown) {
  if (LoadAPIKeyError.isInstance(error)) {
    return true;
  }

  if (APICallError.isInstance(error)) {
    return (
      error.statusCode === 401 ||
      error.statusCode === 402 ||
      error.statusCode === 403 ||
      error.statusCode === 429
    );
  }

  return false;
}

function describeError(error: unknown) {
  if (APICallError.isInstance(error)) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode,
        responseBody: error.responseBody,
      },
      null,
      2,
    );
  }

  if (error instanceof Error) {
    return JSON.stringify(
      {
        name: error.name,
        message: error.message,
      },
      null,
      2,
    );
  }

  return JSON.stringify(error, null, 2);
}

async function main() {
  console.log(ISSUE_DESCRIPTION);
  console.log(
    'Running a real xAI Responses API stream with xai.tools.webSearch() and asserting every provider-executed tool-call has a matching provider-executed tool-result.',
  );

  const result = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    tools: {
      webSearch: xai.tools.webSearch(),
    },
    toolChoice: 'required',
    maxOutputTokens: 512,
    prompt:
      'Use the web_search tool to search the web for the latest public Vercel AI SDK release information, then summarize it in one sentence.',
  });

  const events: ToolEvents = {
    toolCalls: [],
    toolResults: [],
    inputEvents: [],
  };

  for await (const part of result.stream as AsyncIterable<TextStreamPart<any>>) {
    switch (part.type) {
      case 'tool-input-start':
      case 'tool-input-delta':
      case 'tool-input-end': {
        events.inputEvents.push(part.type);
        console.log(`[${part.type}] ${part.toolName} ${part.toolCallId}`);
        break;
      }

      case 'tool-call': {
        events.toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          providerExecuted: part.providerExecuted,
        });
        console.log(
          `[tool-call] ${part.toolName} ${part.toolCallId} providerExecuted=${String(
            part.providerExecuted,
          )}`,
        );
        break;
      }

      case 'tool-result': {
        events.toolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          providerExecuted: part.providerExecuted,
          output: part.output,
        });
        console.log(
          `[tool-result] ${part.toolName} ${part.toolCallId} providerExecuted=${String(
            part.providerExecuted,
          )} output=${JSON.stringify(part.output)}`,
        );
        break;
      }

      case 'error': {
        throw part.error;
      }
    }
  }

  console.log('Observed xAI provider-executed tool events:');
  console.log(JSON.stringify(events, null, 2));

  const providerExecutedToolCalls = events.toolCalls.filter(
    toolCall => toolCall.providerExecuted === true,
  );
  const providerExecutedToolResults = events.toolResults.filter(
    toolResult => toolResult.providerExecuted === true,
  );

  if (providerExecutedToolCalls.length === 0) {
    throw new Error(
      'The live xAI response did not make a provider-executed webSearch tool-call, so this run did not exercise issue #13218.',
    );
  }

  const missingResults = providerExecutedToolCalls.filter(
    toolCall =>
      !providerExecutedToolResults.some(
        toolResult => toolResult.toolCallId === toolCall.toolCallId,
      ),
  );

  if (missingResults.length > 0) {
    throw new Error(
      `Reproduced #13218: provider-executed tool-call(s) had no matching provider-executed tool-result: ${JSON.stringify(
        missingResults,
      )}`,
    );
  }

  console.log(
    'Could not reproduce #13218: every provider-executed xAI webSearch tool-call had a matching provider-executed tool-result.',
  );
}

main().catch(error => {
  if (isAccessBlocker(error)) {
    console.error('External provider access blocker while attempting #13218:');
    console.error(describeError(error));
    process.exitCode = 2;
    return;
  }

  console.error(describeError(error));
  process.exitCode = 1;
});
