import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError, generateText, type ModelMessage } from 'ai';

type AnthropicContentBlock = {
  type: string;
  id?: string;
  tool_use_id?: string;
  name?: string;
  caller?: {
    type: string;
    tool_id?: string;
  };
};

type AnthropicRequest = {
  messages?: Array<{
    role: string;
    content: AnthropicContentBlock[];
  }>;
};

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
};

function coLocateServerToolResults(
  request: AnthropicRequest,
): AnthropicRequest {
  const transformed = structuredClone(request);

  for (const message of transformed.messages ?? []) {
    if (message.role !== 'assistant') {
      continue;
    }

    const resultsByToolUseId = new Map(
      message.content
        .filter(part => part.tool_use_id != null)
        .map(part => [part.tool_use_id!, part]),
    );
    const reordered: AnthropicContentBlock[] = [];

    for (const part of message.content) {
      if (part.tool_use_id != null) {
        continue;
      }

      reordered.push(part);
      if (part.id != null) {
        const result = resultsByToolUseId.get(part.id);
        if (result != null) {
          reordered.push(result);
          resultsByToolUseId.delete(part.id);
        }
      }
    }

    reordered.push(...resultsByToolUseId.values());
    message.content = reordered;
  }

  return transformed;
}

async function main() {
  let firstRawResponse: AnthropicResponse | undefined;
  let rejectedReplayRequest: AnthropicRequest | undefined;
  let transformedReplayStatus: number | undefined;
  let requestNumber = 0;

  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      requestNumber++;
      const request =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as AnthropicRequest)
          : undefined;
      const response = await globalThis.fetch(input, init);

      if (requestNumber === 1) {
        firstRawResponse = (await response.clone().json()) as AnthropicResponse;
      } else if (requestNumber === 2 && response.status === 400 && request) {
        rejectedReplayRequest = request;
        const transformedResponse = await globalThis.fetch(input, {
          ...init,
          body: JSON.stringify(coLocateServerToolResults(request)),
        });
        transformedReplayStatus = transformedResponse.status;
        await transformedResponse.body?.cancel();
      }

      return response;
    },
  });

  const tools = {
    web_search: anthropic.tools.webSearch_20260209({ maxUses: 6 }),
  };
  const initialUserMessage: ModelMessage = {
    role: 'user',
    content:
      'Use dynamic filtering. In one code execution, run exactly three separate web searches: ' +
      '"AI SDK", "Vercel", and "Anthropic". Then briefly compare the results.',
  };

  const first = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    messages: [initialUserMessage],
    tools,
    maxOutputTokens: 4096,
  });

  try {
    await generateText({
      model: anthropic('claude-sonnet-4-6'),
      messages: [
        initialUserMessage,
        ...first.responseMessages,
        { role: 'user', content: 'Summarize that comparison in one sentence.' },
      ],
      tools,
      maxOutputTokens: 256,
    });
  } catch (error) {
    if (
      !APICallError.isInstance(error) ||
      error.statusCode !== 400 ||
      !error.message.includes(
        'without a corresponding `code_execution_tool_result` block',
      )
    ) {
      throw error;
    }

    const rawWebSearchCalls =
      firstRawResponse?.content?.filter(
        part => part.type === 'server_tool_use' && part.name === 'web_search',
      ) ?? [];
    const replayAssistant = rejectedReplayRequest?.messages?.find(
      message => message.role === 'assistant',
    );
    const replayCodeExecutionResultPresent =
      replayAssistant?.content.some(
        part => part.type === 'code_execution_tool_result',
      ) ?? false;
    const replayWebSearchCalls =
      replayAssistant?.content.filter(
        part => part.type === 'server_tool_use' && part.name === 'web_search',
      ) ?? [];

    if (
      rawWebSearchCalls.length < 2 ||
      !rawWebSearchCalls.every(part => part.caller?.tool_id != null) ||
      !replayCodeExecutionResultPresent ||
      !replayWebSearchCalls.every(part => part.caller == null) ||
      transformedReplayStatus !== 200
    ) {
      throw new Error(
        'Live response did not satisfy the issue #18785 reproduction preconditions.',
      );
    }

    console.error(
      JSON.stringify({
        rawNestedWebSearchCalls: rawWebSearchCalls.length,
        rawNestedCallsHaveCaller: true,
        replayNestedCallsHaveCaller: false,
        replayCodeExecutionResultPresent,
        rejectedReplayStatus: error.statusCode,
        transformedReplayStatus,
      }),
    );
    throw new Error(
      'ISSUE #18785 REPRODUCED: Anthropic rejected the multi-turn replay even though code_execution_tool_result was present.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
