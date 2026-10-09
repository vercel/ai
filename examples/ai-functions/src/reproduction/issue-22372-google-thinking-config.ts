import { createGoogle } from '@ai-sdk/google';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { generateText } from 'ai';

type ThinkingConfig = {
  thinkingBudget?: number;
  includeThoughts?: boolean;
  thinkingLevel?: string;
};

type RequestBody = {
  generationConfig?: {
    thinkingConfig?: ThinkingConfig;
  };
};

type ReproductionCase = {
  name: string;
  modelId: string;
  reasoning: 'none' | 'minimal' | 'high';
  providerThinkingConfig?: ThinkingConfig;
  expected: ThinkingConfig;
};

const cases: ReproductionCase[] = [
  {
    name: 'AU-prefixed Gemini 3.5 Flash uses Gemini 3 thinking levels',
    modelId: 'au.gemini-3.5-flash',
    reasoning: 'none',
    providerThinkingConfig: { includeThoughts: false },
    expected: { thinkingLevel: 'minimal', includeThoughts: false },
  },
  {
    name: 'EU-prefixed Gemini 3.5 Flash uses Gemini 3 thinking levels',
    modelId: 'eu.gemini-3.5-flash',
    reasoning: 'none',
    expected: { thinkingLevel: 'minimal' },
  },
  {
    name: 'US-prefixed Gemini 3.1 Pro uses the Pro minimum',
    modelId: 'us.gemini-3.1-pro',
    reasoning: 'none',
    expected: { thinkingLevel: 'low' },
  },
  {
    name: 'Gemini 3.5 Pro maps reasoning none to its low minimum',
    modelId: 'gemini-3.5-pro',
    reasoning: 'none',
    expected: { thinkingLevel: 'low' },
  },
  {
    name: 'Gemini 3.5 Pro maps reasoning minimal to its low minimum',
    modelId: 'gemini-3.5-pro',
    reasoning: 'minimal',
    expected: { thinkingLevel: 'low' },
  },
  {
    name: 'Gemini 3.1 Pro maps reasoning none to its low minimum',
    modelId: 'gemini-3.1-pro',
    reasoning: 'none',
    expected: { thinkingLevel: 'low' },
  },
  {
    name: 'Gemini 3.1 Pro maps reasoning minimal to its low minimum',
    modelId: 'gemini-3.1-pro',
    reasoning: 'minimal',
    expected: { thinkingLevel: 'low' },
  },
  {
    name: 'explicit thinkingBudget removes the resolved thinkingLevel',
    modelId: 'gemini-3-pro-preview',
    reasoning: 'high',
    providerThinkingConfig: { thinkingBudget: 999 },
    expected: { thinkingBudget: 999 },
  },
];

function createCapturingFetch(requests: RequestBody[]) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(
      (await new Response(init?.body as BodyInit).json()) as RequestBody,
    );

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'OK' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };
}

function configsMatch(
  actual: ThinkingConfig | undefined,
  expected: ThinkingConfig,
) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  const googleRequests: RequestBody[] = [];
  const vertexRequests: RequestBody[] = [];

  const google = createGoogle({
    apiKey: 'test-api-key',
    fetch: createCapturingFetch(googleRequests),
  });
  const vertex = createGoogleVertex({
    apiKey: 'test-api-key',
    baseURL: 'https://example.com/v1/publishers/google',
    fetch: createCapturingFetch(vertexRequests),
  });

  const providers: Array<{
    name: string;
    requests: RequestBody[];
    model: (modelId: string) => LanguageModelV4;
  }> = [
    { name: '@ai-sdk/google', requests: googleRequests, model: google },
    {
      name: '@ai-sdk/google-vertex',
      requests: vertexRequests,
      model: vertex,
    },
  ];

  const failures: string[] = [];

  for (const provider of providers) {
    for (const reproductionCase of cases) {
      const requestIndex = provider.requests.length;

      await generateText({
        model: provider.model(reproductionCase.modelId),
        prompt: 'Reply with OK.',
        reasoning: reproductionCase.reasoning,
        providerOptions: reproductionCase.providerThinkingConfig
          ? {
              google: {
                thinkingConfig: reproductionCase.providerThinkingConfig,
              },
            }
          : undefined,
      });

      const actual =
        provider.requests[requestIndex]?.generationConfig?.thinkingConfig;

      if (!configsMatch(actual, reproductionCase.expected)) {
        failures.push(
          [
            `${provider.name}: ${reproductionCase.name}`,
            `expected=${JSON.stringify(reproductionCase.expected)}`,
            `actual=${JSON.stringify(actual)}`,
          ].join(' '),
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE_22372_REPRODUCED: invalid Gemini thinkingConfig requests\n${failures.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22372 is not present.');
}

main().catch(error => {
  console.error('ISSUE_22372_HARNESS_ERROR', error);
  process.exitCode = 2;
});
