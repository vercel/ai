import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, stepCountIs, tool } from 'ai';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

type AnthropicContentBlock = {
  type?: string;
  id?: string;
  tool_use_id?: string;
  content?: {
    type?: string;
    error_code?: string;
  };
};

type AnthropicMessage = {
  role?: string;
  content?: AnthropicContentBlock[];
};

type AnthropicRequest = {
  messages?: AnthropicMessage[];
};

type CapturedCall = {
  request?: AnthropicRequest;
  responseBody?: string;
  responseStatus?: number;
  responseContentType?: string | null;
};

function parseSseJson(body: string): unknown[] {
  return body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length))
    .filter(data => data !== '[DONE]')
    .map(data => JSON.parse(data));
}

function normalizeSseFixture(body: string): string {
  return `${body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length).trim())
    .filter(data => data !== '[DONE]')
    .join('\n')}\n`;
}

function findContentBlocks(value: unknown): AnthropicContentBlock[] {
  if (value == null || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(findContentBlocks);
  }

  const record = value as Record<string, unknown>;
  const blocks: AnthropicContentBlock[] = [];

  if (
    record.type === 'content_block_start' &&
    record.content_block != null &&
    typeof record.content_block === 'object'
  ) {
    blocks.push(record.content_block as AnthropicContentBlock);
  }

  for (const nested of Object.values(record)) {
    blocks.push(...findContentBlocks(nested));
  }

  return blocks;
}

async function main() {
  const calls: CapturedCall[] = [];

  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      const call: CapturedCall = {
        request:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as AnthropicRequest)
            : undefined,
      };
      calls.push(call);

      const response = await fetch(input, init);
      call.responseStatus = response.status;
      call.responseContentType = response.headers.get('content-type');
      call.responseBody = await response.clone().text();

      return response;
    },
  });

  let finalText: string | undefined;
  let steps: readonly unknown[] | undefined;
  let generationError: unknown;

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      maxOutputTokens: 512,
      temperature: 0,
      prompt: [
        'Follow these steps in order:',
        '1. Use web_fetch on https://httpbin.org/status/500.',
        '2. Wait until web_fetch has returned its result. Do not call tools in parallel.',
        '3. Regardless of whether web_fetch succeeds, call display_products once.',
        '4. After display_products returns, answer with exactly DONE.',
        'Do not skip either tool call.',
      ].join('\n'),
      tools: {
        web_fetch: anthropic.tools.webFetch_20250910({
          maxUses: 1,
        }),
        display_products: tool({
          description:
            'Record that product display was attempted after the web fetch.',
          inputSchema: z.object({}),
          execute: async () => ({ displayed: true }),
        }),
      },
      stopWhen: stepCountIs(4),
    });

    [finalText, steps] = await Promise.all([result.text, result.steps]);
  } catch (error) {
    generationError = error;
  }

  const fixtureBase = new URL(
    '../../../../packages/anthropic/src/__fixtures__/',
    import.meta.url,
  );

  await Promise.all(
    calls.map(async (call, index) => {
      if (call.responseBody == null) {
        return;
      }

      const extension = call.responseContentType?.includes('text/event-stream')
        ? 'chunks.txt'
        : 'json';

      await writeFile(
        new URL(
          `anthropic-issue-10819-web-fetch-error.${index + 1}.${extension}`,
          fixtureBase,
        ),
        extension === 'chunks.txt'
          ? normalizeSseFixture(call.responseBody)
          : call.responseBody,
      );
    }),
  );

  const responseBlocks = calls.flatMap(call => {
    if (call.responseBody == null) {
      return [];
    }

    if (call.responseContentType?.includes('text/event-stream')) {
      return findContentBlocks(parseSseJson(call.responseBody));
    }

    try {
      return findContentBlocks(JSON.parse(call.responseBody));
    } catch {
      return [];
    }
  });

  const errorResult = responseBlocks.find(
    block =>
      block.type === 'web_fetch_tool_result' &&
      block.content?.type === 'web_fetch_tool_result_error',
  );

  if (errorResult?.tool_use_id == null) {
    throw new Error(
      'The live response did not exercise a web_fetch_tool_result_error, so issue #10819 could not be evaluated.',
    );
  }

  const continuationRequest = calls
    .slice(1)
    .map(call => call.request)
    .find(request =>
      request?.messages?.some(
        message =>
          message.role === 'assistant' &&
          message.content?.some(
            block =>
              block.type === 'web_fetch_tool_result' &&
              block.tool_use_id === errorResult.tool_use_id &&
              block.content?.type === 'web_fetch_tool_result_error',
          ),
      ),
    );

  const output = {
    requestCount: calls.length,
    responseStatuses: calls.map(call => call.responseStatus),
    webFetchToolUseId: errorResult.tool_use_id,
    webFetchErrorCode: errorResult.content?.error_code,
    continuationIncludedErrorResult: continuationRequest != null,
    stepCount: steps?.length,
    finalText,
    generationError:
      generationError instanceof Error
        ? {
            name: generationError.name,
            message: generationError.message,
          }
        : generationError,
  };

  console.log(JSON.stringify(output, null, 2));

  if (generationError != null) {
    throw new Error(
      'Reproduced issue #10819: multi-step generation failed after the web fetch error.',
      { cause: generationError },
    );
  }

  if (
    calls.some(
      call => call.responseStatus != null && call.responseStatus >= 400,
    )
  ) {
    throw new Error(
      'Reproduced issue #10819: Anthropic rejected a multi-step continuation request after the web fetch error.',
    );
  }

  if (
    steps == null ||
    steps.length < 2 ||
    finalText == null ||
    !finalText.trim().endsWith('DONE')
  ) {
    throw new Error(
      'Reproduced issue #10819: the multi-step continuation did not expose the expected final text after the web fetch error.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
