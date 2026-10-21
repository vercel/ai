import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  lazySchema,
  parseProviderOptions,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const mistralRealtimeModelOptions = lazySchema(() =>
  zodSchema(
    z.strictObject({
      /** Speech recognition settings for the managed voice agent. */
      stt: z
        .strictObject({
          model: z.string().min(1).optional(),
          language: z.string().min(1).optional(),
          contextBias: z.array(z.string().min(1)).optional(),
          targetStreamingDelayMs: z.number().int().min(80).max(1200).optional(),
          turnDetection: z
            .strictObject({
              startThreshold: z.number().min(0).max(1).optional(),
              eagerEndThreshold: z.number().min(0).max(1).optional(),
              endThreshold: z.number().min(0).max(1).optional(),
              minSilenceMs: z.number().int().nonnegative().optional(),
              endTimeoutMs: z.number().int().nonnegative().optional(),
            })
            .optional(),
        })
        .optional(),
      /** Speech synthesis settings. `sessionConfig.voice` overrides voiceId. */
      tts: z
        .strictObject({
          model: z.string().min(1).optional(),
          voiceId: z.string().min(1).optional(),
          phonemeHints: z
            .record(z.string(), z.array(z.string().min(1)).min(1))
            .optional(),
        })
        .optional(),
      /** Interruptions and reminders during periods of silence. */
      turn: z
        .strictObject({
          allowInterruptions: z.boolean().optional(),
          inactivity: z
            .strictObject({
              timeoutMs: z.number().int().nonnegative().optional(),
              maxReminders: z.number().int().nonnegative().optional(),
              messages: z.array(z.string()).optional(),
            })
            .optional(),
        })
        .optional(),
      /** Text spoken when the session connects. */
      welcomeMessage: z.string().optional(),
      /** Saved agent whose configuration is overridden for this session. */
      agentId: z.string().min(1).optional(),
      /** Version of the saved agent. Omit to use its latest version. */
      agentVersion: z.number().int().nonnegative().optional(),
    }),
  ),
);

export type MistralRealtimeModelOptions = InferSchema<
  typeof mistralRealtimeModelOptions
>;

/** Builds the REST configuration or the subset accepted by session.update. */
export async function buildMistralRealtimeSessionConfig(
  config: RealtimeModelV4SessionConfig,
  { modelId, update = false }: { modelId?: string; update?: boolean } = {},
): Promise<Record<string, unknown>> {
  const allowed = new Set([
    'instructions',
    'tools',
    'providerOptions',
    ...(!update
      ? [
          'voice',
          'inputAudioTranscription',
          'outputAudioTranscription',
          'outputModalities',
        ]
      : []),
  ]);
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && !allowed.has(key)) unsupported(key, update);
  }
  if (config.inputAudioTranscription?.prompt != null) {
    unsupported('inputAudioTranscription.prompt', update);
  }
  if (
    config.outputAudioTranscription != null &&
    Object.values(config.outputAudioTranscription).some(value => value != null)
  ) {
    unsupported('outputAudioTranscription settings', update);
  }
  if (
    config.outputModalities != null &&
    (!config.outputModalities.includes('audio') ||
      config.outputModalities.some(
        value => value !== 'audio' && value !== 'text',
      ))
  ) {
    unsupported('outputModalities without audio', update);
  }

  const options = await parseProviderOptions({
    provider: 'mistral',
    providerOptions: config.providerOptions,
    schema: mistralRealtimeModelOptions,
  });
  if (update && options != null) {
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && key !== 'turn') {
        unsupported(`providerOptions.mistral.${key}`, true);
      }
    }
  }
  if (options?.agentVersion != null && options.agentId == null) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.mistral.agentVersion',
      message: 'Mistral agentVersion requires agentId.',
    });
  }

  const stt = options?.stt;
  const turnDetection = stt?.turnDetection;
  const tts = options?.tts;
  const turn = options?.turn;
  const inactivity = turn?.inactivity;
  return {
    ...(modelId != null && { llm: { model: modelId } }),
    ...(config.instructions != null && { instructions: config.instructions }),
    ...(config.tools != null && {
      tools: config.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          ...(tool.description != null && { description: tool.description }),
          parameters: tool.parameters,
        },
      })),
    }),
    ...((stt != null || config.inputAudioTranscription != null) && {
      stt: {
        model: config.inputAudioTranscription?.model ?? stt?.model,
        language: config.inputAudioTranscription?.language ?? stt?.language,
        context_bias: stt?.contextBias,
        target_streaming_delay_ms: stt?.targetStreamingDelayMs,
        ...(turnDetection != null && {
          turn_detection: {
            start_threshold: turnDetection.startThreshold,
            eager_end_threshold: turnDetection.eagerEndThreshold,
            end_threshold: turnDetection.endThreshold,
            min_silence_ms: turnDetection.minSilenceMs,
            end_timeout_ms: turnDetection.endTimeoutMs,
          },
        }),
      },
    }),
    ...((tts != null || config.voice != null) && {
      tts: {
        model: tts?.model,
        voice_id: config.voice ?? tts?.voiceId,
        phoneme_hints: tts?.phonemeHints,
      },
    }),
    ...(turn != null && {
      turn: {
        allow_interruptions: turn.allowInterruptions,
        ...(inactivity != null && {
          inactivity: {
            timeout_ms: inactivity.timeoutMs,
            max_reminders: inactivity.maxReminders,
            messages: inactivity.messages,
          },
        }),
      },
    }),
    ...(options?.welcomeMessage != null && {
      welcome_message: options.welcomeMessage,
    }),
    ...(options?.agentId != null && { agent_id: options.agentId }),
    ...(options?.agentVersion != null && {
      agent_version: options.agentVersion,
    }),
  };
}

function unsupported(setting: string, update: boolean): never {
  throw new UnsupportedFunctionalityError({
    functionality: `Mistral voice agent ${update ? 'live update of' : 'setting'} ${setting}`,
  });
}
