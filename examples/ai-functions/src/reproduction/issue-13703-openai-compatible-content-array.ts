import fs from 'node:fs';
import type {
  LanguageModelV4Content,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const fixtureDirectory = new URL(
  '../../../../packages/openai-compatible/src/chat/__fixtures__/',
  import.meta.url,
);

const generateFixture = JSON.parse(
  fs.readFileSync(
    new URL('issue-13703-mistral-thinking.json', fixtureDirectory),
    'utf8',
  ),
);
const streamFixture = fs
  .readFileSync(
    new URL('issue-13703-mistral-thinking.chunks.txt', fixtureDirectory),
    'utf8',
  )
  .trim()
  .split('\n')
  .map(line => `data: ${line}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is 17 * 23?' }],
  },
];

const unknownContentPart = {
  type: 'future-part',
  text: { nested: true },
  thinking: { nested: true },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createFixtureModel({
  generateBody,
  streamBody,
}: {
  generateBody: unknown;
  streamBody: string;
}) {
  return createOpenAICompatible({
    baseURL: 'https://api.mistral.ai/v1',
    name: 'mistral',
    fetch: async (_input, init) => {
      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      return requestBody.stream
        ? new Response(streamBody, {
            headers: { 'content-type': 'text/event-stream' },
          })
        : Response.json(generateBody);
    },
  })('mistral-small-latest');
}

async function runGenerate(model: ReturnType<typeof createFixtureModel>) {
  let content: LanguageModelV4Content[] | undefined;
  let error: string | undefined;

  try {
    content = (await model.doGenerate({ prompt })).content;
  } catch (caughtError) {
    error = getErrorMessage(caughtError);
  }

  return { content, error };
}

async function runStream(model: ReturnType<typeof createFixtureModel>) {
  const events: LanguageModelV4StreamPart[] = [];
  let error: string | undefined;

  try {
    const { stream } = await model.doStream({ prompt });
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      events.push(value);
    }
  } catch (caughtError) {
    error = getErrorMessage(caughtError);
  }

  return {
    error,
    validationErrors: events
      .filter(event => event.type === 'error')
      .map(event => getErrorMessage(event.error)),
    reasoning: events
      .filter(event => event.type === 'reasoning-delta')
      .map(event => event.delta)
      .join(''),
    text: events
      .filter(event => event.type === 'text-delta')
      .map(event => event.delta)
      .join(''),
  };
}

async function main() {
  const knownPartsModel = createFixtureModel({
    generateBody: generateFixture,
    streamBody: streamFixture,
  });
  const knownGenerate = await runGenerate(knownPartsModel);
  const knownStream = await runStream(knownPartsModel);

  const unknownGenerateFixture = structuredClone(generateFixture);
  unknownGenerateFixture.choices[0].message.content = [
    unknownContentPart,
    { type: 'text', text: '391' },
  ];
  const unknownStreamFixture = [
    `data: ${JSON.stringify({
      choices: [
        {
          index: 0,
          delta: {
            content: [unknownContentPart, { type: 'text', text: '391' }],
          },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  const unknownPartsModel = createFixtureModel({
    generateBody: unknownGenerateFixture,
    streamBody: unknownStreamFixture,
  });
  const unknownGenerate = await runGenerate(unknownPartsModel);
  const unknownStream = await runStream(unknownPartsModel);

  const observations = {
    knownGenerate,
    knownStream,
    unknownGenerate,
    unknownStream,
  };
  console.log(JSON.stringify(observations, null, 2));

  const failures = [
    knownGenerate.error,
    ...knownStream.validationErrors,
    unknownGenerate.error,
    ...unknownStream.validationErrors,
  ].filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    throw new Error(
      'ISSUE #13703 REPRODUCED: doGenerate and doStream reject array-based chat content instead of normalizing known parts and ignoring unknown parts.',
    );
  }

  if (
    knownGenerate.content?.some(part => part.type === 'reasoning') !== true ||
    knownGenerate.content?.some(part => part.type === 'text') !== true ||
    knownStream.reasoning !== "Okay, let's." ||
    knownStream.text !== '**}\n\\]' ||
    unknownGenerate.content?.length !== 1 ||
    unknownGenerate.content[0].type !== 'text' ||
    unknownStream.text !== '391'
  ) {
    throw new Error(
      'Issue #13703 was not reproduced, but the expected normalization was also not observed.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
