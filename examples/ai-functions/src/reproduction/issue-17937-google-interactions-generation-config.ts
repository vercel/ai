import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';

const settings = {
  prompt: 'Hello, how are you?',
  temperature: 0.5,
  topK: 10,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
} as const;

const interactionFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/google/src/interactions/__fixtures__/issue-17937-top-k.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const generateContentFixture = {
  candidates: [
    {
      content: {
        parts: [{ text: 'OK' }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 6,
    candidatesTokenCount: 1,
    totalTokenCount: 7,
  },
  modelVersion: 'gemini-2.5-flash',
};

type CapturedCall = {
  url: string;
  body: Record<string, any>;
};

function warningMentions(warnings: unknown, option: string) {
  return JSON.stringify(warnings).includes(option);
}

async function main() {
  const calls: CapturedCall[] = [];
  const google = createGoogle({
    apiKey: 'test-api-key',
    baseURL: 'https://issue-17937.test/v1beta',
    fetch: async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });

      const responseBody = url.endsWith('/interactions')
        ? interactionFixture
        : generateContentFixture;

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  await generateText({
    model: google('gemini-2.5-flash'),
    ...settings,
  });

  const modelResult = await generateText({
    model: google.interactions('gemini-2.5-flash'),
    ...settings,
  });

  const agentResult = await generateText({
    model: google.interactions({
      agent: 'antigravity-preview-05-2026',
    }),
    prompt: settings.prompt,
    topK: settings.topK,
    presencePenalty: settings.presencePenalty,
    frequencyPenalty: settings.frequencyPenalty,
  });

  const standardBody = calls.find(call =>
    call.url.includes(':generateContent'),
  )?.body;
  const interactionCalls = calls.filter(call =>
    call.url.endsWith('/interactions'),
  );
  const modelBody = interactionCalls[0]?.body;
  const agentBody = interactionCalls[1]?.body;

  const expectedStandardConfig = {
    topK: settings.topK,
    presencePenalty: settings.presencePenalty,
    frequencyPenalty: settings.frequencyPenalty,
  };

  for (const [field, expected] of Object.entries(expectedStandardConfig)) {
    if (standardBody?.generationConfig?.[field] !== expected) {
      throw new Error(
        `Reproduction setup failed: google() did not forward ${field}.`,
      );
    }
  }

  const options = [
    {
      option: 'topK',
      wireField: 'top_k',
      value: settings.topK,
    },
    {
      option: 'presencePenalty',
      wireField: 'presence_penalty',
      value: settings.presencePenalty,
    },
    {
      option: 'frequencyPenalty',
      wireField: 'frequency_penalty',
      value: settings.frequencyPenalty,
    },
  ] as const;

  const modelSilentDrops = options
    .filter(
      ({ option, wireField, value }) =>
        modelBody?.generation_config?.[wireField] !== value &&
        !warningMentions(modelResult.warnings, option),
    )
    .map(({ option }) => option);

  const agentSilentDrops = options
    .filter(({ option }) => !warningMentions(agentResult.warnings, option))
    .map(({ option }) => option);

  console.log(
    JSON.stringify(
      {
        standardGenerationConfig: standardBody?.generationConfig,
        interactionsGenerationConfig: modelBody?.generation_config,
        interactionsWarnings: modelResult.warnings,
        agentGenerationConfig: agentBody?.generation_config,
        agentWarnings: agentResult.warnings,
        modelSilentDrops,
        agentSilentDrops,
      },
      null,
      2,
    ),
  );

  if (modelSilentDrops.length > 0 || agentSilentDrops.length > 0) {
    throw new Error(
      'Reproduced issue #17937: google.interactions() silently dropped topK, presencePenalty, and frequencyPenalty.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
