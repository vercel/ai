import type { JSONObject } from '@ai-sdk/provider';
import {
  createIdGenerator,
  detectMediaType,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoSpeechGeneratedError } from '../error/no-speech-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveSpeechModel } from '../model/resolve-model';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { SpeechModel } from '../types/speech-model';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';
import { prepareRetries } from '../util/prepare-retries';
import { notify } from '../util/notify';
import { VERSION } from '../version';
import type { SpeechResult } from './generate-speech-result';
import {
  DefaultGeneratedAudioFile,
  type GeneratedAudioFile,
} from './generated-audio-file';
import type {
  GenerateSpeechEndEvent,
  GenerateSpeechStartEvent,
} from './speech-events';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});
/**
 * Generates speech audio using a speech model.
 *
 * @param model - The speech model to use.
 * @param text - The text to convert to speech.
 * @param voice - The voice to use for speech generation.
 * @param outputFormat - The output format to use for speech generation e.g. "mp3", "wav", etc.
 * @param instructions - Instructions for the speech generation e.g. "Speak in a slow and steady tone".
 * @param speed - The speed of the speech generation.
 * @param language - The language for speech generation (ISO 639-1 code e.g. "en", "es", "fr") or "auto" for automatic detection.
 * @param providerOptions - Additional provider-specific options that are passed through to the provider
 * as body parameters.
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param telemetry - Optional telemetry configuration.
 *
 * @returns A result object that contains the generated audio data.
 */
export async function generateSpeech({
  model,
  text,
  voice,
  outputFormat,
  instructions,
  speed,
  language,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  telemetry,
  _internal: { generateCallId = originalGenerateCallId } = {},
}: {
  /**
   * The speech model to use.
   */
  model: SpeechModel;

  /**
   * The text to convert to speech.
   */
  text: string;

  /**
   * The voice to use for speech generation.
   */
  voice?: string;

  /**
   * The desired output format for the audio e.g. "mp3", "wav", etc.
   */
  outputFormat?: 'mp3' | 'wav' | (string & {});

  /**
   * Instructions for the speech generation e.g. "Speak in a slow and steady tone".
   */
  instructions?: string;

  /**
   * The speed of the speech generation.
   */
  speed?: number;

  /**
   * The language for speech generation. This should be an ISO 639-1 language code (e.g. "en", "es", "fr")
   * or "auto" for automatic language detection. Provider support varies.
   */
  language?: string;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   * "openai": {}
   * }
   * ```
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of retries per speech model call. Set to 0 to disable retries.
   *
   * @default 2
   */
  maxRetries?: number;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string>;

  /**
   * Optional telemetry configuration.
   */
  telemetry?: TelemetryOptions;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<SpeechResult> {
  const resolvedModel = resolveSpeechModel(model);
  if (!resolvedModel) {
    throw new Error('Model could not be resolved');
  }

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const callId = generateCallId();
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });
  const runInTracingChannelSpan =
    telemetryDispatcher.runInTracingChannelSpan ??
    (async <T>({ execute }: { execute: () => PromiseLike<T> }) =>
      await execute());

  const startEvent: GenerateSpeechStartEvent = {
    callId,
    operationId: 'ai.generateSpeech',
    provider: resolvedModel.provider,
    modelId: resolvedModel.modelId,
    text,
    voice,
    outputFormat,
    instructions,
    speed,
    language,
    maxRetries,
    headers,
    providerOptions,
  };

  return await runInTracingChannelSpan({
    type: 'generateSpeech',
    event: startEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [telemetryDispatcher.onStart],
      });

      try {
        const result = await retry(() =>
          resolvedModel.doGenerate({
            text,
            voice,
            outputFormat,
            instructions,
            speed,
            language,
            abortSignal,
            headers: headersWithUserAgent,
            providerOptions,
          }),
        );

        if (!result.audio || result.audio.length === 0) {
          throw new NoSpeechGeneratedError({ responses: [result.response] });
        }

        logWarnings({
          warnings: result.warnings,
          provider: resolvedModel.provider,
          model: resolvedModel.modelId,
        });

        const detectedMediaType = detectMediaType({
          data: result.audio,
          topLevelType: 'audio',
        });

        const audio = new DefaultGeneratedAudioFile({
          data: result.audio,
          mediaType:
            detectedMediaType ??
            getResponseAudioMediaType(result.response.headers) ??
            getOutputFormatMediaType(outputFormat) ??
            'audio/mp3',
        });

        if (telemetryDispatcher.onEnd != null) {
          const endEvent: GenerateSpeechEndEvent = {
            callId,
            operationId: 'ai.generateSpeech',
            provider: resolvedModel.provider,
            modelId: resolvedModel.modelId,
            text,
            audio: {
              byteLength: getBase64OrBinaryByteLength(result.audio),
              mediaType: audio.mediaType,
              format: audio.format,
            },
            usage: result.usage,
            warnings: result.warnings,
            providerMetadata: result.providerMetadata,
            response: getTelemetryResponseMetadata(result.response),
          };

          await notify({
            event: endEvent,
            callbacks: [telemetryDispatcher.onEnd],
          });
        }

        return new DefaultSpeechResult({
          audio,
          warnings: result.warnings,
          responses: [result.response],
          providerMetadata: result.providerMetadata,
        });
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}

function getBase64OrBinaryByteLength(audio: string | Uint8Array): number {
  if (audio instanceof Uint8Array) {
    return audio.byteLength;
  }

  let characterCount = 0;
  let lastCharacter = '';
  let secondLastCharacter = '';
  for (const character of audio) {
    if (/\s/.test(character)) {
      continue;
    }
    characterCount++;
    secondLastCharacter = lastCharacter;
    lastCharacter = character;
  }

  const padding =
    lastCharacter === '=' ? (secondLastCharacter === '=' ? 2 : 1) : 0;
  return Math.floor((characterCount * 3) / 4) - padding;
}

function getTelemetryResponseMetadata(
  response: SpeechModelResponseMetadata,
): SpeechModelResponseMetadata {
  return {
    timestamp: response.timestamp,
    modelId: response.modelId,
    headers: response.headers,
  };
}

function getResponseAudioMediaType(
  headers: Record<string, string> | undefined,
): string | undefined {
  const mediaType = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'content-type',
  )?.[1];

  if (mediaType == null) {
    return undefined;
  }

  const normalizedMediaType = mediaType.split(';', 1)[0].trim().toLowerCase();

  if (normalizedMediaType.length === 0) {
    return undefined;
  }

  return normalizedMediaType.startsWith('audio/')
    ? normalizedMediaType
    : undefined;
}

function getOutputFormatMediaType(outputFormat: string | undefined) {
  if (outputFormat == null) {
    return undefined;
  }

  const normalizedOutputFormat = outputFormat.trim().toLowerCase();

  switch (normalizedOutputFormat) {
    case 'pcm':
    case 'audio/pcm':
      return 'audio/pcm';
    case 'audio/l16':
      return 'audio/l16';
    case 'mulaw':
    case 'audio/mulaw':
      return 'audio/mulaw';
    case 'alaw':
    case 'audio/alaw':
      return 'audio/alaw';
    default:
      return undefined;
  }
}

class DefaultSpeechResult implements SpeechResult {
  readonly audio: GeneratedAudioFile;
  readonly warnings: Array<Warning>;
  readonly responses: Array<SpeechModelResponseMetadata>;
  readonly providerMetadata: Record<string, JSONObject>;

  constructor(options: {
    audio: GeneratedAudioFile;
    warnings: Array<Warning>;
    responses: Array<SpeechModelResponseMetadata>;
    providerMetadata: Record<string, JSONObject> | undefined;
  }) {
    this.audio = options.audio;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata ?? {};
  }
}
