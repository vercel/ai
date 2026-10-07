import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool, type ModelMessage } from 'ai';

const errorText = 'exit code 1: migration failed';

const messages: ModelMessage[] = [
  { role: 'user', content: 'deploy to prod' },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'toolu_1',
        toolName: 'deploy',
        input: { env: 'prod' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'toolu_1',
        toolName: 'deploy',
        output: { type: 'error-text', value: errorText },
      },
    ],
  },
];

const tools = {
  deploy: tool({
    description: 'deploy the service',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { env: { type: 'string' } },
    }),
  }),
};

type ProviderName = 'openai' | 'google' | 'anthropic';

const capturedBodies = new Map<ProviderName, Record<string, unknown>>();

function createCapturingFetch(provider: ProviderName): typeof fetch {
  return async (_input, init) => {
    if (typeof init?.body !== 'string') {
      throw new Error(`${provider}: expected a string request body`);
    }

    capturedBodies.set(provider, JSON.parse(init.body));
    throw new Error(`captured:${provider}`);
  };
}

async function captureRequest(
  provider: ProviderName,
  model: Parameters<typeof generateText>[0]['model'],
): Promise<void> {
  try {
    await generateText({
      model,
      tools,
      messages,
      maxRetries: 0,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === `captured:${provider}` ||
        error.message.includes(`captured:${provider}`))
    ) {
      return;
    }

    throw error;
  }

  throw new Error(`${provider}: request unexpectedly completed`);
}

function getRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new Error(`${label}: expected an object`);
  }

  return value as Record<string, unknown>;
}

function getArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: expected an array`);
  }

  return value;
}

function hasGoogleErrorMarker(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasGoogleErrorMarker);
  }

  if (typeof value !== 'object' || value == null) {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (
      ['error', 'errorText', 'is_error', 'isError'].includes(key) &&
      nestedValue !== false &&
      nestedValue != null
    ) {
      return true;
    }

    return hasGoogleErrorMarker(nestedValue);
  });
}

async function main(): Promise<void> {
  const openai = createOpenAI({
    apiKey: 'test',
    fetch: createCapturingFetch('openai'),
  });
  const google = createGoogleGenerativeAI({
    apiKey: 'test',
    fetch: createCapturingFetch('google'),
  });
  const anthropic = createAnthropic({
    apiKey: 'test',
    fetch: createCapturingFetch('anthropic'),
  });

  await captureRequest('openai', openai.chat('gpt-4o'));
  await captureRequest('google', google('gemini-2.0-flash'));
  await captureRequest('anthropic', anthropic('claude-3-5-sonnet-20241022'));

  const openaiBody = getRecord(capturedBodies.get('openai'), 'OpenAI body');
  const openaiMessages = getArray(openaiBody.messages, 'OpenAI messages');
  const openaiToolMessage = getRecord(
    openaiMessages.find(
      message =>
        getRecord(message, 'OpenAI message').role === 'tool' &&
        getRecord(message, 'OpenAI message').tool_call_id === 'toolu_1',
    ),
    'OpenAI tool message',
  );

  const googleBody = getRecord(capturedBodies.get('google'), 'Google body');
  const googleContents = getArray(googleBody.contents, 'Google contents');
  const googleToolContent = getRecord(
    googleContents.find(content =>
      getArray(
        getRecord(content, 'Google content').parts,
        'Google content parts',
      ).some(
        part => getRecord(part, 'Google part').functionResponse !== undefined,
      ),
    ),
    'Google tool content',
  );
  const googleFunctionResponsePart = getRecord(
    getArray(googleToolContent.parts, 'Google tool content parts').find(
      part => getRecord(part, 'Google part').functionResponse !== undefined,
    ),
    'Google function response part',
  );
  const googleFunctionResponse = getRecord(
    googleFunctionResponsePart.functionResponse,
    'Google function response',
  );
  const googleResponse = getRecord(
    googleFunctionResponse.response,
    'Google response',
  );

  const anthropicBody = getRecord(
    capturedBodies.get('anthropic'),
    'Anthropic body',
  );
  const anthropicMessages = getArray(
    anthropicBody.messages,
    'Anthropic messages',
  );
  const anthropicToolResult = getRecord(
    anthropicMessages
      .flatMap(message => {
        const content = getRecord(message, 'Anthropic message').content;
        return Array.isArray(content) ? content : [];
      })
      .find(
        part =>
          getRecord(part, 'Anthropic content part').type === 'tool_result',
      ),
    'Anthropic tool result',
  );

  if (anthropicToolResult.is_error !== true) {
    throw new Error(
      'Anthropic control failed: error-text did not produce is_error: true',
    );
  }

  const failures: string[] = [];

  if (openaiToolMessage.content === errorText) {
    failures.push(
      'OpenAI error-text output was serialized as an unmarked normal tool result',
    );
  }

  if (
    JSON.stringify(googleResponse).includes(errorText) &&
    !hasGoogleErrorMarker(googleResponse)
  ) {
    failures.push(
      'Google error-text output was serialized under response.content without an error marker',
    );
  }

  console.log(
    JSON.stringify(
      {
        openaiToolMessage,
        googleFunctionResponse,
        anthropicToolResult,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    console.error(`ISSUE #22207 REPRODUCED: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #22207 not reproduced: OpenAI and Google preserved error semantics.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
