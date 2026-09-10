import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { z } from 'zod/v4';
import {
  openaiRealtimeModelLiveOptionsSchema,
  openaiRealtimeModelLiveUpdateOptionsSchema,
  type OpenAIRealtimeModelLiveUpdateOptions,
} from './openai-realtime-model-live-options';

const audioFormatSchema = z.union([
  z.strictObject({
    type: z.literal('audio/pcm'),
    rate: z.union([z.literal(16000), z.literal(24000)]),
  }),
  z.strictObject({
    type: z.enum(['audio/pcma', 'audio/pcmu']),
    rate: z.literal(8000),
  }),
]);

export function buildOpenAILiveSessionConfig(
  config: RealtimeModelV4SessionConfig,
  modelId: string,
): Record<string, unknown> {
  for (const key of Object.keys(config)) {
    if (
      ![
        'instructions',
        'voice',
        'inputAudioFormat',
        'outputAudioFormat',
        'providerOptions',
      ].includes(key)
    ) {
      throw new UnsupportedFunctionalityError({
        functionality: `OpenAI Live session setting: ${key}`,
      });
    }
  }

  const options = openaiRealtimeModelLiveOptionsSchema.parse(
    config.providerOptions?.openai ?? {},
  );
  if (options.voice != null && config.voice != null) {
    throw new InvalidArgumentError({
      argument: 'voice',
      message: 'Choose either voice or providerOptions.openai.voice.',
    });
  }
  const inputFormat =
    config.inputAudioFormat == null
      ? undefined
      : audioFormatSchema.parse(config.inputAudioFormat);
  const outputFormat =
    config.outputAudioFormat == null
      ? undefined
      : audioFormatSchema.parse(config.outputAudioFormat);
  if (
    inputFormat != null &&
    outputFormat != null &&
    (inputFormat.type !== outputFormat.type ||
      inputFormat.rate !== outputFormat.rate)
  ) {
    throw new InvalidArgumentError({
      argument: 'outputAudioFormat',
      message: 'OpenAI Live requires the same input and output audio format.',
    });
  }

  return {
    model: modelId,
    ...(config.instructions !== undefined
      ? { instructions: config.instructions }
      : {}),
    audio: {
      format: inputFormat ?? outputFormat ?? { type: 'audio/pcm', rate: 24000 },
      output: { voice: options.voice ?? config.voice ?? 'marin' },
    },
    ...(options.delegation !== undefined
      ? {
          delegation:
            options.delegation?.type === 'responses'
              ? {
                  type: 'responses',
                  responses: convertResponsesOptions(
                    options.delegation.responses,
                  ),
                }
              : options.delegation,
        }
      : {}),
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.store !== undefined ? { store: options.store } : {}),
  };
}

export function buildOpenAILiveSessionUpdate(
  config: RealtimeModelV4SessionConfig,
): Record<string, unknown> {
  if (Object.keys(config).some(key => key !== 'providerOptions')) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'OpenAI Live session updates outside delegation.responses; use context-append or create a new session',
    });
  }
  const options = openaiRealtimeModelLiveUpdateOptionsSchema.parse(
    config.providerOptions?.openai,
  );
  return {
    delegation: {
      type: 'responses',
      responses: convertResponsesOptions(options.delegation.responses),
    },
  };
}

function convertResponsesOptions({
  toolChoice,
  parallelToolCalls,
  maxOutputTokens,
  serviceTier,
  ...options
}: OpenAIRealtimeModelLiveUpdateOptions['delegation']['responses']) {
  return {
    ...options,
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    ...(parallelToolCalls !== undefined
      ? { parallel_tool_calls: parallelToolCalls }
      : {}),
    ...(maxOutputTokens !== undefined
      ? { max_output_tokens: maxOutputTokens }
      : {}),
    ...(serviceTier !== undefined ? { service_tier: serviceTier } : {}),
  };
}
