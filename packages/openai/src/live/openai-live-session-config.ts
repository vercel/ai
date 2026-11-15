import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { z } from 'zod/v4';
import { openaiRealtimeModelLiveOptionsSchema } from './openai-realtime-model-live-options';

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
  transport: 'websocket' | 'webrtc' = 'websocket',
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

  if (
    z
      .object({ delegation: z.object({ type: z.literal('responses') }) })
      .safeParse(config.providerOptions?.openai).success
  ) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'OpenAI Live Responses delegation; only client delegation is supported',
    });
  }
  const options = openaiRealtimeModelLiveOptionsSchema.parse(
    config.providerOptions?.openai ?? {},
  );
  if (options.client !== undefined && transport !== 'webrtc') {
    throw new UnsupportedFunctionalityError({
      functionality: 'OpenAI Live client permissions outside WebRTC startup',
    });
  }
  if (options.voice != null && config.voice != null) {
    throw new InvalidArgumentError({
      argument: 'voice',
      message: 'Choose either voice or providerOptions.openai.voice.',
    });
  }
  if (
    transport === 'webrtc' &&
    (config.inputAudioFormat !== undefined ||
      config.outputAudioFormat !== undefined)
  ) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'Fixed audio formats for OpenAI Live WebRTC; audio is negotiated through SDP',
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
      ...(transport === 'websocket'
        ? {
            format: inputFormat ??
              outputFormat ?? { type: 'audio/pcm', rate: 24000 },
          }
        : {}),
      output: { voice: options.voice ?? config.voice ?? 'marin' },
    },
    ...(options.delegation !== undefined
      ? { delegation: options.delegation }
      : {}),
    ...(options.client !== undefined
      ? {
          client: {
            data_channel: {
              ...(options.client.dataChannel.allowedClientEvents !== undefined
                ? {
                    allowed_client_events:
                      options.client.dataChannel.allowedClientEvents,
                  }
                : {}),
              ...(options.client.dataChannel.allowedServerEvents !== undefined
                ? {
                    allowed_server_events:
                      options.client.dataChannel.allowedServerEvents === 'all'
                        ? 'all'
                        : options.client.dataChannel.allowedServerEvents.map(
                            selector => ({
                              type: selector.type,
                              ...(selector.responseEvent !== undefined
                                ? { response_event: selector.responseEvent }
                                : {}),
                            }),
                          ),
                  }
                : {}),
            },
          },
        }
      : {}),
    ...(options.input !== undefined ? { input: options.input } : {}),
    ...(options.store !== undefined ? { store: options.store } : {}),
  };
}
