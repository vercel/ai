import {
  UnsupportedFunctionalityError,
  InvalidResponseDataError,
  type Experimental_SpeechModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { NoSpeechGeneratedError } from '../error/no-speech-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveSpeechModel } from '../model/resolve-model';
import { asAsyncIterableStream } from '../util/async-iterable-stream';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { generateSpeech } from './generate-speech';
import type {
  SpeechStreamPart,
  StreamSpeechResult,
} from './stream-speech-result';

/**
 * Starts a streaming speech request. Accepts the same options as generateSpeech.
 * Retries apply only while opening the request, never after audio has started.
 * Await the result, then consume either audioStream or fullStream once.
 */
export async function streamSpeech({
  model,
  maxRetries,
  headers,
  providerOptions = {},
  ...options
}: Parameters<typeof generateSpeech>[0]): Promise<StreamSpeechResult> {
  const resolvedModel = resolveSpeechModel(model);
  if (!resolvedModel) {
    throw new Error('Model could not be resolved');
  }

  const doStream = resolvedModel.doStream?.bind(resolvedModel);
  if (doStream == null) {
    throw new UnsupportedFunctionalityError({
      functionality: 'streaming speech',
      message: `The ${resolvedModel.provider} model "${resolvedModel.modelId}" does not support streaming speech.`,
    });
  }

  const { retry } = prepareRetries({
    maxRetries,
    abortSignal: options.abortSignal,
  });
  const result = await retry(() =>
    doStream({
      ...options,
      providerOptions,
      headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
    }),
  );

  logWarnings({
    warnings: result.warnings,
    provider: resolvedModel.provider,
    model: resolvedModel.modelId,
  });

  let hasAudio = false;
  let finished = false;
  const stream = result.stream.pipeThrough(
    new TransformStream<Experimental_SpeechModelV4StreamPart, SpeechStreamPart>(
      {
        transform(part, controller) {
          if (finished) {
            throw new InvalidResponseDataError({
              data: part,
              message: 'Speech stream continued after its finish event.',
            });
          }
          if (part.type === 'finish') {
            finished = true;
            controller.enqueue(part);
            return;
          }
          const audio =
            typeof part.audio === 'string'
              ? convertBase64ToUint8Array(part.audio)
              : part.audio;
          if (audio.length > 0) {
            hasAudio = true;
            controller.enqueue({ ...part, audio });
          }
        },
        flush() {
          if (!hasAudio) {
            throw new NoSpeechGeneratedError({ responses: [result.response] });
          }
          if (!finished) {
            throw new InvalidResponseDataError({
              data: undefined,
              message: 'Speech stream ended without a finish event.',
            });
          }
        },
      },
    ),
  );

  let claimed = false;
  function claimStream() {
    if (claimed) {
      throw new Error(
        'Choose either audioStream or fullStream and consume it once.',
      );
    }
    claimed = true;
    return stream;
  }

  return {
    warnings: result.warnings,
    responses: [result.response],
    get fullStream() {
      return asAsyncIterableStream(claimStream());
    },
    get audioStream() {
      return asAsyncIterableStream(
        claimStream().pipeThrough(
          new TransformStream<SpeechStreamPart, Uint8Array>({
            transform(part, controller) {
              if (part.type === 'audio') {
                controller.enqueue(part.audio);
              } else if (part.finishReason.unified !== 'stop') {
                throw new InvalidResponseDataError({
                  data: part,
                  message: `Speech generation ended with finish reason: ${part.finishReason.raw ?? part.finishReason.unified}.`,
                });
              }
            },
          }),
        ),
      );
    },
  };
}
