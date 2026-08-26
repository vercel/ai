import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import { readFile } from 'node:fs/promises';

const generateFixtureUrl = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/moonshotai-metadata-live.json',
  import.meta.url,
);
const streamFixtureUrl = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/moonshotai-metadata-live.chunks.txt',
  import.meta.url,
);

const expectedGenerateMetadata = {
  moonshotai: {
    responseObject: 'chat.completion',
    choiceIndex: 0,
    messageRole: 'assistant',
    toolCallTypes: ['function'],
  },
};

const expectedStreamMetadata = {
  moonshotai: {
    responseObject: 'chat.completion.chunk',
    choiceIndex: 0,
    messageRole: 'assistant',
    toolCallTypes: ['function'],
  },
};

function hasMetadata(
  value: unknown,
  expected: {
    moonshotai: {
      responseObject: string;
      choiceIndex: number;
      messageRole: string;
      toolCallTypes: string[];
    };
  },
) {
  const metadata = value as
    | {
        moonshotai?: {
          responseObject?: unknown;
          choiceIndex?: unknown;
          messageRole?: unknown;
          toolCallTypes?: unknown;
        };
      }
    | undefined;

  return (
    metadata?.moonshotai?.responseObject ===
      expected.moonshotai.responseObject &&
    metadata.moonshotai.choiceIndex === expected.moonshotai.choiceIndex &&
    metadata.moonshotai.messageRole === expected.moonshotai.messageRole &&
    JSON.stringify(metadata.moonshotai.toolCallTypes) ===
      JSON.stringify(expected.moonshotai.toolCallTypes)
  );
}

async function main() {
  const [generateFixture, streamFixture] = await Promise.all([
    readFile(generateFixtureUrl, 'utf8'),
    readFile(streamFixtureUrl, 'utf8'),
  ]);

  const provider = createMoonshotAI({
    apiKey: 'fixture-api-key',
    fetch: async (_input, init) => {
      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      if (requestBody.stream === true) {
        const body = `${streamFixture
          .trim()
          .split('\n')
          .map(line => `data: ${line}\n\n`)
          .join('')}data: [DONE]\n\n`;
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return new Response(generateFixture, {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const model = provider.chatModel('kimi-k3');
  const options: LanguageModelV3CallOptions = {
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Use get_weather to check Paris weather.',
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ],
    toolChoice: { type: 'required' },
  };

  const generated = await model.doGenerate(options);
  const rawGenerate = generated.response?.body as {
    object?: string;
    choices?: Array<{
      index?: number;
      message?: {
        role?: string;
        tool_calls?: Array<{ type?: string }>;
      };
    }>;
  };

  if (
    rawGenerate.object !== 'chat.completion' ||
    rawGenerate.choices?.[0]?.index !== 0 ||
    rawGenerate.choices[0].message?.role !== 'assistant' ||
    rawGenerate.choices[0].message?.tool_calls?.[0]?.type !== 'function'
  ) {
    throw new Error(
      'Recorded Moonshot generate fixture does not contain the documented metadata.',
    );
  }

  if (
    !generated.content.some(
      part =>
        part.type === 'tool-call' &&
        part.toolName === 'get_weather' &&
        part.input === '{"city": "Paris"}',
    )
  ) {
    throw new Error('Moonshot generate tool-call content changed.');
  }

  const streamed = await model.doStream({
    ...options,
    includeRawChunks: true,
  });
  const streamParts: LanguageModelV3StreamPart[] = [];
  const reader = streamed.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    streamParts.push(value);
  }

  type RawChunk = {
    object?: string;
    choices?: Array<{
      index?: number;
      delta?: {
        role?: string;
        tool_calls?: Array<{ type?: string }>;
      };
    }>;
  };
  const rawChunks = streamParts
    .filter(
      (part): part is Extract<LanguageModelV3StreamPart, { type: 'raw' }> =>
        part.type === 'raw',
    )
    .map(part => part.rawValue as RawChunk);
  const finish = streamParts.find(
    (part): part is Extract<LanguageModelV3StreamPart, { type: 'finish' }> =>
      part.type === 'finish',
  );

  if (
    !rawChunks.some(chunk => chunk.object === 'chat.completion.chunk') ||
    !rawChunks.some(chunk => chunk.choices?.[0]?.index === 0) ||
    !rawChunks.some(chunk => chunk.choices?.[0]?.delta?.role === 'assistant') ||
    !rawChunks.some(
      chunk => chunk.choices?.[0]?.delta?.tool_calls?.[0]?.type === 'function',
    )
  ) {
    throw new Error(
      'Recorded Moonshot stream fixture does not contain the documented metadata.',
    );
  }

  if (
    !streamParts.some(
      part =>
        part.type === 'tool-call' &&
        part.toolName === 'get_weather' &&
        part.input === '{"city": "Paris"}',
    )
  ) {
    throw new Error('Moonshot stream tool-call content changed.');
  }

  const observation = {
    rawGenerateMetadata: expectedGenerateMetadata,
    generateProviderMetadata: generated.providerMetadata,
    rawStreamMetadata: expectedStreamMetadata,
    streamFinishProviderMetadata: finish?.providerMetadata,
  };
  console.log(JSON.stringify(observation, null, 2));

  if (
    !hasMetadata(generated.providerMetadata, expectedGenerateMetadata) ||
    !hasMetadata(finish?.providerMetadata, expectedStreamMetadata)
  ) {
    throw new Error(
      'Issue #19559 reproduced: Moonshot chat response metadata was not preserved in generate and stream results.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
