import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  LanguageModelV3,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { generateText, stepCountIs, streamText } from 'ai';

const invalidToolCallId = 'srvtoolu_issue_17366_invalid';
const deferredToolCallId = 'srvtoolu_issue_17366_deferred';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

type CapturedCall = {
  requestBody: unknown;
  responseStatus?: number;
  responseBody?: unknown;
};

function createLiveHarness() {
  const calls: CapturedCall[] = [];
  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      const call: CapturedCall = {
        requestBody:
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      };
      calls.push(call);

      const response = await fetch(input, init);
      call.responseStatus = response.status;
      call.responseBody = await response
        .clone()
        .json()
        .catch(() => undefined);
      return response;
    },
  });

  return {
    anthropic,
    calls,
    liveModel: anthropic('claude-sonnet-4-5'),
  };
}

function isExpectedRejection(call: CapturedCall | undefined) {
  const responseMessage = JSON.stringify(call?.responseBody);
  return (
    call?.responseStatus === 400 &&
    responseMessage.includes('unexpected `tool_use_id`') &&
    responseMessage.includes(invalidToolCallId)
  );
}

async function reproduceGenerateText() {
  const { anthropic, calls, liveModel } = createLiveHarness();
  let callCount = 0;
  const model: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: liveModel.provider,
    modelId: liveModel.modelId,
    supportedUrls: liveModel.supportedUrls,
    doStream: options => liveModel.doStream(options),
    doGenerate: async options => {
      if (callCount++ > 0) {
        return liveModel.doGenerate(options);
      }

      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: invalidToolCallId,
            toolName: 'web_search',
            input: '{}',
            providerExecuted: true,
          },
          {
            type: 'tool-result',
            toolCallId: invalidToolCallId,
            toolName: 'web_search',
            result: {
              type: 'web_search_tool_result_error',
              errorCode: 'invalid_tool_input',
            },
            isError: true,
          },
          {
            type: 'tool-call',
            toolCallId: deferredToolCallId,
            toolName: 'web_search',
            input: '{"query":"AI SDK"}',
            providerExecuted: true,
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage,
        warnings: [],
      } satisfies LanguageModelV3GenerateResult;
    },
  };

  try {
    await generateText({
      model,
      prompt: 'Reproduce issue #17366.',
      tools: {
        web_search: anthropic.tools.webSearch_20250305(),
      },
      stopWhen: stepCountIs(2),
    });
  } catch {
    if (isExpectedRejection(calls[0])) {
      return calls[0];
    }
  }

  throw new Error(
    'Expected Anthropic to reject the generateText follow-up request for issue #17366.',
  );
}

async function reproduceStreamText() {
  const { anthropic, calls, liveModel } = createLiveHarness();
  let callCount = 0;
  const model: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: liveModel.provider,
    modelId: liveModel.modelId,
    supportedUrls: liveModel.supportedUrls,
    doGenerate: options => liveModel.doGenerate(options),
    doStream: async options => {
      if (callCount++ > 0) {
        return liveModel.doStream(options);
      }

      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'tool-call',
              toolCallId: invalidToolCallId,
              toolName: 'web_search',
              input: '{}',
              providerExecuted: true,
            });
            controller.enqueue({
              type: 'tool-result',
              toolCallId: invalidToolCallId,
              toolName: 'web_search',
              result: {
                type: 'web_search_tool_result_error',
                errorCode: 'invalid_tool_input',
              },
              isError: true,
            });
            controller.enqueue({
              type: 'tool-call',
              toolCallId: deferredToolCallId,
              toolName: 'web_search',
              input: '{"query":"AI SDK"}',
              providerExecuted: true,
            });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage,
            });
            controller.close();
          },
        }),
      } satisfies LanguageModelV3StreamResult;
    },
  };

  try {
    const result = streamText({
      model,
      prompt: 'Reproduce issue #17366.',
      tools: {
        web_search: anthropic.tools.webSearch_20250305(),
      },
      stopWhen: stepCountIs(2),
      onError: () => {},
    });
    await result.consumeStream();
  } catch {}

  if (isExpectedRejection(calls[0])) {
    return calls[0];
  }

  throw new Error(
    'Expected Anthropic to reject the streamText follow-up request for issue #17366.',
  );
}

async function main() {
  const generateTextCall = await reproduceGenerateText();
  const streamTextCall = await reproduceStreamText();

  console.log(
    JSON.stringify(
      {
        generateText: {
          request: generateTextCall?.requestBody,
          responseStatus: generateTextCall?.responseStatus,
          response: generateTextCall?.responseBody,
        },
        streamText: {
          request: streamTextCall?.requestBody,
          responseStatus: streamTextCall?.responseStatus,
          response: streamTextCall?.responseBody,
        },
      },
      null,
      2,
    ),
  );

  throw new Error(
    'Reproduced issue #17366: generateText and streamText sent orphaned srvtoolu_ tool_result blocks that Anthropic rejected.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
