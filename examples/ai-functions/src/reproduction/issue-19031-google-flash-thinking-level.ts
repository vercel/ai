import { createGoogle } from '@ai-sdk/google';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

type Reasoning = Exclude<
  LanguageModelV4CallOptions['reasoning'],
  'provider-default' | undefined
>;

type FixtureFetch = NonNullable<
  NonNullable<Parameters<typeof createGoogle>[0]>['fetch']
>;

type Scenario = {
  modelId: string;
  reasoning: Reasoning;
  expectedThinkingLevel: 'minimal' | 'low';
  providerRejectsMinimal: boolean;
};

const fixtureDirectory = new URL(
  '../../../../packages/google/src/__fixtures__/',
  import.meta.url,
);

async function loadFixture(filename: string) {
  return JSON.parse(
    await readFile(new URL(filename, fixtureDirectory), 'utf8'),
  );
}

async function runScenario({
  scenario,
  unsupportedResponse,
  successResponse,
}: {
  scenario: Scenario;
  unsupportedResponse: unknown;
  successResponse: unknown;
}) {
  let actualThinkingLevel: unknown;

  const fixtureFetch: FixtureFetch = async (_input, init) => {
    if (typeof init?.body !== 'string') {
      throw new Error('Expected @ai-sdk/google to send a JSON request body.');
    }

    const requestBody = JSON.parse(init.body);
    actualThinkingLevel =
      requestBody.generationConfig?.thinkingConfig?.thinkingLevel;

    const isUnsupported =
      scenario.providerRejectsMinimal && actualThinkingLevel === 'minimal';

    return new Response(
      JSON.stringify(isUnsupported ? unsupportedResponse : successResponse),
      {
        status: isUnsupported ? 400 : 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const google = createGoogle({
    apiKey: 'recorded-fixture',
    fetch: fixtureFetch,
    generateId: () => 'issue-19031',
  });

  try {
    const result = await generateText({
      model: google(scenario.modelId),
      prompt: 'Reply with OK.',
      reasoning: scenario.reasoning,
      maxOutputTokens: 32,
      maxRetries: 0,
    });

    return {
      ...scenario,
      actualThinkingLevel,
      outcome: 'success' as const,
      text: result.text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message !==
      'Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.'
    ) {
      throw error;
    }

    return {
      ...scenario,
      actualThinkingLevel,
      outcome: 'provider-error' as const,
      error: message,
    };
  }
}

async function main() {
  (
    globalThis as typeof globalThis & { AI_SDK_LOG_WARNINGS?: boolean }
  ).AI_SDK_LOG_WARNINGS = false;

  const [unsupportedResponse, successResponse] = await Promise.all([
    loadFixture('google-thinking-level-minimal-unsupported.json'),
    loadFixture('google-thinking-level-low-success.json'),
  ]);

  const currentProviderScenarios: Scenario[] = [
    {
      modelId: 'gemini-3.7-flash',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
    {
      modelId: 'gemini-3.7-flash',
      reasoning: 'none',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
    {
      modelId: 'gemini-3.7-flash-video-understanding-eap',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
    {
      modelId: 'gemini-3.7-flash-video-understanding-eap',
      reasoning: 'none',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
    {
      modelId: 'gemini-flash-latest',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
    {
      modelId: 'gemini-flash-latest',
      reasoning: 'none',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: true,
    },
  ];

  const modelMatchingScenarios: Scenario[] = [
    {
      modelId: 'models/gemini-3.7-flash',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-3.8-flash',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-3.10-flash-preview',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-4.0-flash',
      reasoning: 'minimal',
      expectedThinkingLevel: 'low',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-3-flash-preview',
      reasoning: 'minimal',
      expectedThinkingLevel: 'minimal',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-3.6-flash',
      reasoning: 'minimal',
      expectedThinkingLevel: 'minimal',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-3.7-flash-lite',
      reasoning: 'minimal',
      expectedThinkingLevel: 'minimal',
      providerRejectsMinimal: false,
    },
    {
      modelId: 'gemini-flash-lite-latest',
      reasoning: 'minimal',
      expectedThinkingLevel: 'minimal',
      providerRejectsMinimal: false,
    },
  ];

  const results = [];
  for (const scenario of [
    ...currentProviderScenarios,
    ...modelMatchingScenarios,
  ]) {
    results.push(
      await runScenario({ scenario, unsupportedResponse, successResponse }),
    );
  }

  console.log(
    JSON.stringify(
      {
        expected:
          'reasoning minimal and none use thinkingLevel low for full Gemini Flash 3.7+ and gemini-flash-latest, while older Flash and Flash-Lite retain minimal',
        results,
      },
      null,
      2,
    ),
  );

  const primaryFailures = results.filter(
    result =>
      result.providerRejectsMinimal && result.outcome === 'provider-error',
  );

  if (primaryFailures.length > 0) {
    throw new Error(
      'ISSUE_19031_PRIMARY: @ai-sdk/google sends unsupported thinkingLevel "minimal" for Gemini Flash models that require "low".',
    );
  }

  const mappingFailures = results.filter(
    result => result.actualThinkingLevel !== result.expectedThinkingLevel,
  );

  if (mappingFailures.length > 0) {
    throw new Error(
      `Issue #19031 model matching is incomplete: ${mappingFailures
        .map(
          result =>
            `${result.modelId} expected ${result.expectedThinkingLevel} but received ${String(result.actualThinkingLevel)}`,
        )
        .join('; ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
