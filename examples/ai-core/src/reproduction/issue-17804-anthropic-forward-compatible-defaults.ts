import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  LanguageModelV2CallWarning,
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Return a short greeting.' }],
  },
];

const jsonResponseFormat: NonNullable<
  LanguageModelV2CallOptions['responseFormat']
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
  options: Omit<LanguageModelV2CallOptions, 'prompt'> = {},
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

function hasUnknownModelWarning(
  warnings: LanguageModelV2CallWarning[],
  modelId: string,
  maxOutputTokens: number,
) {
  return warnings.some(
    warning =>
      warning.type === 'other' &&
      warning.message?.includes(`The model "${modelId}" is unknown.`) &&
      warning.message.includes(
        `limited to ${maxOutputTokens}. Set maxOutputTokens explicitly`,
      ),
  );
}

function hasSamplingWarning(
  warnings: LanguageModelV2CallWarning[],
  setting: string,
) {
  return warnings.some(
    warning =>
      warning.type === 'unsupported-setting' &&
      String(warning.setting) === setting &&
      warning.details?.includes('will be ignored'),
  );
}

async function main() {
  const knownCurrentClaudeId = 'claude-opus-4-8';
  const futureClaudeId = 'claude-future-9';
  const prefixedFutureClaudeId = 'us.anthropic.claude-future-9-20990101-v1:0';
  const nonClaudeId = 'third-party-future-model';

  const structuredOutputOptions = {
    responseFormat: jsonResponseFormat,
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'auto',
      },
    },
  } satisfies Omit<LanguageModelV2CallOptions, 'prompt'>;

  const samplingOptions = {
    temperature: 0.3,
    topP: 0.8,
    topK: 10,
  } satisfies Omit<LanguageModelV2CallOptions, 'prompt'>;

  const currentGenerationReasoningOptions = {
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'xhigh',
      },
    },
  } satisfies Omit<LanguageModelV2CallOptions, 'prompt'>;

  const knownDefault = await captureRequest(knownCurrentClaudeId);
  const knownStructured = await captureRequest(
    knownCurrentClaudeId,
    structuredOutputOptions,
  );
  const knownSampling = await captureRequest(
    knownCurrentClaudeId,
    samplingOptions,
  );

  const futureDefault = await captureRequest(futureClaudeId);
  const futureStructured = await captureRequest(
    futureClaudeId,
    structuredOutputOptions,
  );
  const futureSampling = await captureRequest(futureClaudeId, samplingOptions);
  const futureReasoning = await captureRequest(
    futureClaudeId,
    currentGenerationReasoningOptions,
  );
  const prefixedDefault = await captureRequest(prefixedFutureClaudeId);

  const nonClaudeDefault = await captureRequest(nonClaudeId);
  const nonClaudeStructured = await captureRequest(
    nonClaudeId,
    structuredOutputOptions,
  );
  const nonClaudeSampling = await captureRequest(nonClaudeId, samplingOptions);

  const knownCurrentGenerationBehavior = {
    maxOutputTokens: knownDefault.requestBody.max_tokens === 128000,
    nativeStructuredOutput:
      knownStructured.requestBody.output_config?.format?.type ===
        'json_schema' && knownStructured.requestBody.tools == null,
    samplingParametersStripped:
      knownSampling.requestBody.temperature == null &&
      knownSampling.requestBody.top_p == null &&
      knownSampling.requestBody.top_k == null &&
      hasSamplingWarning(knownSampling.warnings, 'temperature') &&
      hasSamplingWarning(knownSampling.warnings, 'topP') &&
      hasSamplingWarning(knownSampling.warnings, 'topK'),
  };

  const expectedFutureClaudeBehavior = {
    maxOutputTokens:
      futureDefault.requestBody.max_tokens === 128000 &&
      hasUnknownModelWarning(futureDefault.warnings, futureClaudeId, 128000),
    nativeStructuredOutput:
      futureStructured.requestBody.output_config?.format?.type ===
        'json_schema' && futureStructured.requestBody.tools == null,
    samplingParametersStripped:
      futureSampling.requestBody.temperature == null &&
      futureSampling.requestBody.top_p == null &&
      futureSampling.requestBody.top_k == null &&
      hasSamplingWarning(futureSampling.warnings, 'temperature') &&
      hasSamplingWarning(futureSampling.warnings, 'topP') &&
      hasSamplingWarning(futureSampling.warnings, 'topK'),
    platformPrefixMatched:
      prefixedDefault.requestBody.max_tokens === 128000 &&
      hasUnknownModelWarning(
        prefixedDefault.warnings,
        prefixedFutureClaudeId,
        128000,
      ),
  };

  const nonClaudeConservativeBehavior = {
    maxOutputTokens:
      nonClaudeDefault.requestBody.max_tokens === 4096 &&
      hasUnknownModelWarning(nonClaudeDefault.warnings, nonClaudeId, 4096),
    jsonToolFallback:
      nonClaudeStructured.requestBody.output_config == null &&
      nonClaudeStructured.requestBody.tools?.some(
        (tool: { name?: string }) => tool.name === 'json',
      ),
    samplingParametersPreserved:
      nonClaudeSampling.requestBody.temperature === 0.3 &&
      nonClaudeSampling.requestBody.top_p === 0.8 &&
      nonClaudeSampling.requestBody.top_k === 10 &&
      !hasSamplingWarning(nonClaudeSampling.warnings, 'temperature') &&
      !hasSamplingWarning(nonClaudeSampling.warnings, 'topP') &&
      !hasSamplingWarning(nonClaudeSampling.warnings, 'topK'),
  };

  const releaseV5ProviderReasoningControls = {
    adaptiveThinking: futureReasoning.requestBody.thinking?.type === 'adaptive',
    xhighEffort: futureReasoning.requestBody.output_config?.effort === 'xhigh',
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
        releaseV5ProviderReasoningControls,
        releaseV5Gap:
          'LanguageModelV2CallOptions has no top-level reasoning option, so the reported reasoning-to-thinking/effort mapping is not present on release-v5.0.',
      },
      null,
      2,
    ),
  );

  if (Object.values(knownCurrentGenerationBehavior).some(value => !value)) {
    throw new Error(
      'Reproduction invalid: the known current-generation Claude control behavior changed.',
    );
  }

  if (Object.values(nonClaudeConservativeBehavior).some(value => !value)) {
    throw new Error(
      'Reproduction invalid: the non-Claude conservative control behavior changed.',
    );
  }

  if (Object.values(releaseV5ProviderReasoningControls).some(value => !value)) {
    throw new Error(
      'Reproduction invalid: release-v5.0 provider-specific adaptive thinking or xhigh effort pass-through changed.',
    );
  }

  if (Object.values(expectedFutureClaudeBehavior).some(value => !value)) {
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
