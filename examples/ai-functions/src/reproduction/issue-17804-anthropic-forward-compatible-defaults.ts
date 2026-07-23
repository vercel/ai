import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';

type RequestBody = Record<string, unknown>;

const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const requests: RequestBody[] = [];

const provider = createAnthropic({
  apiKey: 'test-api-key',
  fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    requests.push(body);

    return new Response(
      JSON.stringify({
        model: body.model,
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
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

async function capture(
  modelId: string,
  options: Omit<LanguageModelV3CallOptions, 'prompt'> = {},
) {
  const result = await provider(modelId).doGenerate({ prompt, ...options });
  const request = requests.at(-1);

  if (request == null) {
    throw new Error(`No request captured for ${modelId}`);
  }

  return { request, warnings: result.warnings };
}

function hasWarning(
  warnings: Array<{ type: string; feature?: string; details?: string }>,
  feature: string,
  details: string,
) {
  return warnings.some(
    warning =>
      warning.feature === feature && warning.details?.includes(details),
  );
}

async function main() {
  const unknownClaude = await capture('claude-future-9', {
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
    },
  });

  const unknownClaudeSampling = await capture('claude-future-9', {
    temperature: 0.5,
    topP: 0.8,
    topK: 20,
  });

  const unknownClaudeThinking = await capture('claude-future-9', {
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'xhigh',
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  const platformPrefixedClaude = await capture(
    'us.anthropic.claude-future-9-20990101-v1:0',
  );

  const knownCurrentClaude = await capture('claude-opus-4-8', {
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
    },
    temperature: 0.5,
    topP: 0.8,
    topK: 20,
  });

  const unknownNonClaude = await capture('third-party-future-model', {
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
    },
    temperature: 0.5,
    topP: 0.8,
    topK: 20,
  });

  const observations = {
    unknownClaude: {
      maxTokens: unknownClaude.request.max_tokens,
      usesNativeStructuredOutput:
        (unknownClaude.request.output_config as RequestBody | undefined)
          ?.format != null,
      usesJsonToolFallback: Array.isArray(unknownClaude.request.tools),
      warningRetained: hasWarning(
        unknownClaude.warnings,
        'maxOutputTokens',
        'The model "claude-future-9" is unknown.',
      ),
    },
    unknownClaudeSampling: {
      temperature: unknownClaudeSampling.request.temperature,
      topP: unknownClaudeSampling.request.top_p,
      topK: unknownClaudeSampling.request.top_k,
      warnings: unknownClaudeSampling.warnings,
    },
    unknownClaudeThinking: {
      thinking: unknownClaudeThinking.request.thinking,
      effort: (
        unknownClaudeThinking.request.output_config as RequestBody | undefined
      )?.effort,
    },
    platformPrefixedClaude: {
      maxTokens: platformPrefixedClaude.request.max_tokens,
    },
    knownCurrentClaude: {
      maxTokens: knownCurrentClaude.request.max_tokens,
      usesNativeStructuredOutput:
        (knownCurrentClaude.request.output_config as RequestBody | undefined)
          ?.format != null,
      temperature: knownCurrentClaude.request.temperature,
      topP: knownCurrentClaude.request.top_p,
      topK: knownCurrentClaude.request.top_k,
    },
    unknownNonClaude: {
      maxTokens: unknownNonClaude.request.max_tokens,
      usesNativeStructuredOutput:
        (unknownNonClaude.request.output_config as RequestBody | undefined)
          ?.format != null,
      usesJsonToolFallback: Array.isArray(unknownNonClaude.request.tools),
      temperature: unknownNonClaude.request.temperature,
      topP: unknownNonClaude.request.top_p,
      topK: unknownNonClaude.request.top_k,
    },
  };

  console.log(JSON.stringify(observations, null, 2));

  const failures: string[] = [];

  if (observations.unknownClaude.maxTokens !== 128000) {
    failures.push(
      `unknown Claude max_tokens was ${observations.unknownClaude.maxTokens}, expected 128000`,
    );
  }
  if (!observations.unknownClaude.usesNativeStructuredOutput) {
    failures.push(
      'unknown Claude used the JSON-tool structured-output fallback',
    );
  }
  if (
    observations.unknownClaudeSampling.temperature != null ||
    observations.unknownClaudeSampling.topP != null ||
    observations.unknownClaudeSampling.topK != null
  ) {
    failures.push('unknown Claude retained rejected sampling parameters');
  }
  if (!observations.unknownClaude.warningRetained) {
    failures.push('unknown Claude compatibility warning was not retained');
  }
  if (observations.platformPrefixedClaude.maxTokens !== 128000) {
    failures.push(
      `platform-prefixed Claude max_tokens was ${observations.platformPrefixedClaude.maxTokens}, expected 128000`,
    );
  }
  if (
    observations.unknownNonClaude.maxTokens !== 4096 ||
    observations.unknownNonClaude.usesNativeStructuredOutput ||
    !observations.unknownNonClaude.usesJsonToolFallback
  ) {
    failures.push('unknown non-Claude model lost conservative defaults');
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_17804_REPRODUCED: unknown Claude IDs use legacy capability defaults\n${failures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
