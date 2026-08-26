import type { LanguageModelV2Prompt } from '../../../../packages/provider/src';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMoonshotAI } from '../../../../packages/moonshotai/src/moonshotai-provider';

const fixtureDirectory = fileURLToPath(
  new URL('../../../../packages/moonshotai/src/__fixtures__/', import.meta.url),
);

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Use get_weather.' }] },
];

const expectedGenerateMetadata = {
  responseObject: 'chat.completion',
  choiceIndex: 0,
  messageRole: 'assistant',
  toolCallTypes: ['function'],
};

const expectedStreamMetadata = {
  responseObject: 'chat.completion.chunk',
  choiceIndex: 0,
  messageRole: 'assistant',
  toolCallTypes: ['function'],
};

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
    );
  }
}

async function main() {
  const jsonFixtureText = await fs.readFile(
    `${fixtureDirectory}/moonshotai-metadata-live.json`,
    'utf8',
  );
  const jsonFixture = JSON.parse(jsonFixtureText);
  const chunkFixture = await fs.readFile(
    `${fixtureDirectory}/moonshotai-metadata-live.chunks.txt`,
    'utf8',
  );

  const provider = createMoonshotAI({
    apiKey: 'fixture-key',
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      if (requestBody.stream) {
        const sse = chunkFixture
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => `data: ${line}\n\n`)
          .join('');
        return new Response(`${sse}data: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return new Response(jsonFixtureText, {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const generated = await provider.chatModel('kimi-k3').doGenerate({ prompt });
  const rawGenerate = generated.response?.body as any;

  assertEqual(
    {
      object: rawGenerate.object,
      index: rawGenerate.choices[0].index,
      role: rawGenerate.choices[0].message.role,
      toolCallTypes: rawGenerate.choices[0].message.tool_calls.map(
        (toolCall: any) => toolCall.type,
      ),
    },
    {
      object: 'chat.completion',
      index: 0,
      role: 'assistant',
      toolCallTypes: ['function'],
    },
    'Recorded Moonshot JSON response does not contain the documented metadata',
  );
  assertEqual(
    generated.content.filter(part => part.type === 'tool-call'),
    [
      {
        type: 'tool-call',
        toolCallId: 'get_weather_0',
        toolName: 'get_weather',
        input: '{"city": "Paris"}',
      },
    ],
    'Unified generate tool-call content changed',
  );
  assertEqual(
    generated.response?.body,
    jsonFixture,
    'Raw generate response changed',
  );

  const streamed = await provider.chatModel('kimi-k3').doStream({
    prompt,
    includeRawChunks: true,
  });
  const streamParts = [];
  for await (const part of streamed.stream) {
    streamParts.push(part);
  }
  const rawChunks = streamParts
    .filter(part => part.type === 'raw')
    .map(part => part.rawValue as any);
  const finish = streamParts.find(part => part.type === 'finish');

  assertEqual(
    {
      objects: [
        ...new Set(rawChunks.map(chunk => chunk.object).filter(Boolean)),
      ],
      indexes: [
        ...new Set(
          rawChunks.flatMap(
            chunk => chunk.choices?.map((choice: any) => choice.index) ?? [],
          ),
        ),
      ],
      roles: [
        ...new Set(
          rawChunks.flatMap(
            chunk =>
              chunk.choices
                ?.map((choice: any) => choice.delta?.role)
                .filter(Boolean) ?? [],
          ),
        ),
      ],
      toolCallTypes: [
        ...new Set(
          rawChunks.flatMap(
            chunk =>
              chunk.choices?.flatMap(
                (choice: any) =>
                  choice.delta?.tool_calls
                    ?.map((toolCall: any) => toolCall.type)
                    .filter(Boolean) ?? [],
              ) ?? [],
          ),
        ),
      ],
    },
    {
      objects: ['chat.completion.chunk'],
      indexes: [0],
      roles: ['assistant'],
      toolCallTypes: ['function'],
    },
    'Recorded Moonshot SSE chunks do not contain the documented metadata',
  );
  assertEqual(
    streamParts.filter(part => part.type === 'tool-call'),
    [
      {
        type: 'tool-call',
        toolCallId: 'get_weather_0',
        toolName: 'get_weather',
        input: '{"city": "Paris"}',
      },
    ],
    'Unified stream tool-call content changed',
  );

  const failures: string[] = [];
  if (
    JSON.stringify(generated.providerMetadata?.moonshotai) !==
    JSON.stringify(expectedGenerateMetadata)
  ) {
    failures.push(
      `generate metadata: ${JSON.stringify(generated.providerMetadata?.moonshotai)}`,
    );
  }
  if (
    finish?.type !== 'finish' ||
    JSON.stringify(finish.providerMetadata?.moonshotai) !==
      JSON.stringify(expectedStreamMetadata)
  ) {
    failures.push(
      `stream finish metadata: ${
        finish?.type === 'finish'
          ? JSON.stringify(finish.providerMetadata?.moonshotai)
          : 'missing finish part'
      }`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_19559_REPRODUCED: Moonshot metadata was dropped from generate and stream finish results',
    );
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
