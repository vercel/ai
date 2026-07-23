import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Return a short greeting.' }],
  },
];

const jsonResponseFormat: NonNullable<
  LanguageModelV4CallOptions['responseFormat']
> = {
  type: 'json',
  schema: {
    type: 'object',
    properties: {
      greeting: { type: 'string' },
    },
    required: ['greeting'],
    additionalProperties: false,
  },
};

async function captureRequest(
  modelId: string,
  options: Omit<LanguageModelV4CallOptions, 'prompt'> = {},
) {
  let requestBody: Record<string, any> | undefined;

  const anthropic = createAnthropic({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          id: 'msg_reproduction',
          type: 'message',
          role: 'assistant',
          model: modelId,
          content: [{ type: 'text', text: '{"greeting":"hello"}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await anthropic(modelId).doGenerate({
    prompt,
    ...options,
  });

  if (requestBody == null) {
    throw new Error(`No request was captured for ${modelId}.`);
  }

  return { requestBody, warnings: result.warnings };
}

function hasWarning(
  warnings: Array<{ type: string; feature?: string; details?: string }>,
  feature: string,
  details?: string,
) {
  return warnings.some(
    warning =>
      warning.feature === feature &&
      (details == null || warning.details?.includes(details)),
  );
}

async function main() {
  const knownCurrentClaudeId = 'claude-opus-4-8';
  const futureClaudeId = 'claude-future-9';
  const prefixedFutureClaudeId = 'us.anthropic.claude-future-9-20990101-v1:0';
  const nonClaudeId = 'third-party-future-model';

  const knownCurrent = await captureRequest(knownCurrentClaudeId, {
    responseFormat: jsonResponseFormat,
    reasoning: 'xhigh',
    temperature: 0.3,
    topP: 0.8,
    topK: 10,
  });

  const futureDefault = await captureRequest(futureClaudeId);
  const futureStructured = await captureRequest(futureClaudeId, {
    responseFormat: jsonResponseFormat,
  });
  const futureReasoning = await captureRequest(futureClaudeId, {
    reasoning: 'xhigh',
  });
  const futureSampling = await captureRequest(futureClaudeId, {
    temperature: 0.3,
    topP: 0.8,
    topK: 10,
  });
  const prefixedDefault = await captureRequest(prefixedFutureClaudeId);

  const nonClaudeDefault = await captureRequest(nonClaudeId);
  const nonClaudeStructured = await captureRequest(nonClaudeId, {
    responseFormat: jsonResponseFormat,
  });
  const nonClaudeReasoning = await captureRequest(nonClaudeId, {
    reasoning: 'xhigh',
  });
  const nonClaudeSampling = await captureRequest(nonClaudeId, {
    temperature: 0.3,
    topP: 0.8,
    topK: 10,
  });

  const expectedFutureClaudeBehavior = {
    maxOutputTokens:
      futureDefault.requestBody.max_tokens === 128000 &&
      hasWarning(
        futureDefault.warnings,
        'maxOutputTokens',
        'model "claude-future-9" is unknown',
      ),
    nativeStructuredOutput:
      futureStructured.requestBody.output_config?.format?.type ===
        'json_schema' && futureStructured.requestBody.tools == null,
    adaptiveThinking:
      futureReasoning.requestBody.thinking?.type === 'adaptive' &&
      futureReasoning.requestBody.output_config?.effort === 'xhigh',
    samplingParametersStripped:
      futureSampling.requestBody.temperature == null &&
      futureSampling.requestBody.top_p == null &&
      futureSampling.requestBody.top_k == null &&
      hasWarning(futureSampling.warnings, 'temperature', 'will be ignored') &&
      hasWarning(futureSampling.warnings, 'topP', 'will be ignored') &&
      hasWarning(futureSampling.warnings, 'topK', 'will be ignored'),
    platformPrefixMatched:
      prefixedDefault.requestBody.max_tokens === 128000 &&
      hasWarning(prefixedDefault.warnings, 'maxOutputTokens', 'is unknown'),
  };

  const nonClaudeConservativeBehavior = {
    maxOutputTokens:
      nonClaudeDefault.requestBody.max_tokens === 4096 &&
      hasWarning(
        nonClaudeDefault.warnings,
        'maxOutputTokens',
        'limited to 4096',
      ),
    jsonToolFallback:
      nonClaudeStructured.requestBody.output_config == null &&
      nonClaudeStructured.requestBody.tools?.some(
        (tool: { name?: string }) => tool.name === 'json',
      ),
    legacyThinking:
      nonClaudeReasoning.requestBody.thinking?.type === 'enabled' &&
      typeof nonClaudeReasoning.requestBody.thinking?.budget_tokens ===
        'number' &&
      nonClaudeReasoning.requestBody.output_config?.effort == null,
    samplingParametersPreserved:
      nonClaudeSampling.requestBody.temperature === 0.3 &&
      nonClaudeSampling.requestBody.top_p === 0.8 &&
      nonClaudeSampling.requestBody.top_k === 10,
  };

  const knownCurrentGenerationBehavior = {
    maxOutputTokens: knownCurrent.requestBody.max_tokens === 128000,
    nativeStructuredOutput:
      knownCurrent.requestBody.output_config?.format?.type === 'json_schema' &&
      knownCurrent.requestBody.tools == null,
    adaptiveThinking:
      knownCurrent.requestBody.thinking?.type === 'adaptive' &&
      knownCurrent.requestBody.output_config?.effort === 'xhigh',
    samplingParametersStripped:
      knownCurrent.requestBody.temperature == null &&
      knownCurrent.requestBody.top_p == null &&
      knownCurrent.requestBody.top_k == null,
  };

  console.log(
    JSON.stringify(
      {
        futureClaudeObserved: {
          defaultMaxTokens: futureDefault.requestBody.max_tokens,
          defaultWarnings: futureDefault.warnings,
          structuredOutput: {
            outputConfig: futureStructured.requestBody.output_config,
            tools: futureStructured.requestBody.tools,
          },
          reasoning: {
            thinking: futureReasoning.requestBody.thinking,
            outputConfig: futureReasoning.requestBody.output_config,
            warnings: futureReasoning.warnings,
          },
          sampling: {
            temperature: futureSampling.requestBody.temperature,
            topP: futureSampling.requestBody.top_p,
            topK: futureSampling.requestBody.top_k,
            warnings: futureSampling.warnings,
          },
          prefixedDefaultMaxTokens: prefixedDefault.requestBody.max_tokens,
        },
        expectedFutureClaudeBehavior,
        knownCurrentGenerationBehavior,
        nonClaudeConservativeBehavior,
      },
      null,
      2,
    ),
  );

  const knownCurrentGenerationRegressed = Object.values(
    knownCurrentGenerationBehavior,
  ).some(value => !value);
  if (knownCurrentGenerationRegressed) {
    throw new Error(
      'Reproduction invalid: the known current-generation Claude control behavior changed.',
    );
  }

  const nonClaudeRegressed = Object.values(nonClaudeConservativeBehavior).some(
    value => !value,
  );
  if (nonClaudeRegressed) {
    throw new Error(
      'Reproduction invalid: the non-Claude conservative control behavior changed.',
    );
  }

  const futureClaudeIsForwardCompatible = Object.values(
    expectedFutureClaudeBehavior,
  ).every(Boolean);
  if (!futureClaudeIsForwardCompatible) {
    throw new Error(
      'ISSUE #17804 REPRODUCED: unrecognized claude-* ids use legacy capability defaults',
    );
  }

  console.log(
    'Issue #17804 is not reproduced: unknown Claude IDs use current-generation defaults.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
