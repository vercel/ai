import {
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamPart,
  type JSONObject,
} from '@ai-sdk/provider';
import {
  convertAsyncIteratorToReadableStream,
  convertBase64ToUint8Array,
  DelayedPromise,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoSpeechGeneratedError } from '../error/no-speech-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveSpeechModel } from '../model/resolve-model';
import type { SpeechModel } from '../types/speech-model';
import type { SpeechModelResponseMetadata } from '../types/speech-model-response-metadata';
import type { Warning } from '../types/warning';
import { asAsyncIterableStream } from '../util/async-iterable-stream';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { VERSION } from '../version';
import { isStreamingSpeechModel } from './is-streaming-speech-model';
import type {
  SpeechStreamPart,
  SpeechStreamUsage,
  StreamSpeechResult,
} from './stream-speech-result';

/**
 * Streams speech audio using a speech model.
 *
 * @param model - The speech model to use. It must support streaming speech.
 * @param text - The text to convert to speech: a complete string, or a stream of text deltas
 * (e.g. the text stream of `streamText`) that is synthesized as it arrives.
 * @param voice - The voice to use for speech generation.
 * @param outputFormat - The output format to use for speech generation. Supported values are provider-specific.
 * @param instructions - Instructions for the speech generation e.g. "Speak in a slow and steady tone".
 * @param speed - The speed of the speech generation.
 * @param language - The language for speech generation (ISO 639-1 code e.g. "en", "es", "fr") or "auto" for automatic detection.
 * @param providerOptions - Additional provider-specific options.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP/WebSocket headers to send when supported by the provider.
 * @param includeRawChunks - When true, raw provider chunks are included in `fullStream`.
 *
 * @returns A result object with the audio stream and the final usage and metadata.
 */
export function streamSpeech({
  model,
  text,
  voice,
  outputFormat,
  instructions,
  speed,
  language,
  providerOptions = {},
  abortSignal,
  headers,
  includeRawChunks,
  _internal: { currentDate = () => new Date() } = {},
}: {
  /**
   * The speech model to use.
   */
  model: SpeechModel;

  /**
   * The text to convert to speech, either as a complete string or as a
   * stream of text deltas.
   */
  text: string | AsyncIterable<string> | ReadableStream<string>;

  /**
   * The voice to use for speech generation.
   */
  voice?: string;

  /**
   * The desired output format for the audio. Supported values are
   * provider-specific.
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
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request, if supported by the provider.
   */
  headers?: Record<string, string>;

  /**
   * When true, providers should include raw provider chunks in the stream.
   */
  includeRawChunks?: boolean;

  /**
   * Internal test hooks.
   */
  _internal?: {
    currentDate?: () => Date;
  };
}): StreamSpeechResult {
  const resolvedModel = resolveSpeechModel(model);
  if (!resolvedModel) {
    throw new Error('Model could not be resolved');
  }

  if (!isStreamingSpeechModel(resolvedModel)) {
    throw new UnsupportedFunctionalityError({
      functionality: 'streaming speech',
      message:
        `The ${resolvedModel.provider} model "${resolvedModel.modelId}" does not support streaming speech.` +
        (typeof model === 'string'
          ? ' String model IDs resolve through the global provider (AI Gateway by default).' +
            ' If that provider does not support streaming speech, pass a provider model' +
            " instance instead (e.g. elevenlabs.speech('eleven_flash_v2_5'))" +
            ' or upgrade @ai-sdk/gateway to a version with streaming speech support.'
          : ''),
    });
  }

  const textStream = toTextStream(text);
  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const usagePromise = new DelayedPromise<SpeechStreamUsage>();
  const warningsPromise = new DelayedPromise<Array<Warning>>();
  const responsesPromise = new DelayedPromise<
    Array<SpeechModelResponseMetadata>
  >();
  const providerMetadataPromise = new DelayedPromise<
    Record<string, JSONObject>
  >();

  const rejectPendingPromises = (error: unknown) => {
    for (const promise of [
      usagePromise,
      warningsPromise,
      responsesPromise,
      providerMetadataPromise,
    ]) {
      if (promise.isPending()) {
        promise.reject(error);
      }
    }
  };

  const startedAt = currentDate();
  let response: SpeechModelResponseMetadata | undefined;
  const currentResponseMetadata = () =>
    response ?? { timestamp: startedAt, modelId: resolvedModel.modelId };

  const resolveWarnings = (warnings: Array<Warning>) => {
    warningsPromise.resolve(warnings);
    logWarnings({
      warnings,
      provider: resolvedModel.provider,
      model: resolvedModel.modelId,
    });
  };

  // Cancelling the output stream aborts the model pipe with a defined reason
  // (an undefined reason surfaces as an unhandled rejection on newer Node.js).
  const pipeAbortController = new AbortController();
  let hasAudio = false;
  let finished = false;

  // `Transformer.cancel` is supported at runtime but missing from the
  // ambient `Transformer` type, so widen it here.
  const transformer: Transformer<
    Experimental_SpeechModelV4StreamPart,
    SpeechStreamPart
  > & { cancel?: (reason?: unknown) => void } = {
    transform(value, controller) {
      switch (value.type) {
        case 'stream-start': {
          resolveWarnings(value.warnings);
          break;
        }

        case 'response-metadata': {
          response = {
            timestamp: value.timestamp ?? currentResponseMetadata().timestamp,
            modelId: value.modelId ?? currentResponseMetadata().modelId,
            headers: value.headers ?? response?.headers,
            body: value.body ?? response?.body,
          };
          break;
        }

        case 'audio': {
          const audio =
            typeof value.audio === 'string'
              ? convertBase64ToUint8Array(value.audio)
              : value.audio;
          // Empty chunks are dropped unless they carry provider metadata
          // (e.g. an end-of-turn marker); those never count as audio.
          if (audio.length === 0 && value.providerMetadata == null) {
            break;
          }
          hasAudio ||= audio.length > 0;
          controller.enqueue({
            type: 'audio',
            ...(value.id != null && { id: value.id }),
            audio,
            audioFormat: value.audioFormat,
            ...(value.providerMetadata != null && {
              providerMetadata: value.providerMetadata,
            }),
          });
          break;
        }

        case 'raw':
        case 'error': {
          controller.enqueue(value);
          break;
        }

        case 'finish': {
          if (!warningsPromise.isResolved()) {
            resolveWarnings([]);
          }

          if (!hasAudio) {
            throw new NoSpeechGeneratedError({
              responses: [currentResponseMetadata()],
            });
          }

          finished = true;
          usagePromise.resolve(value.usage ?? {});
          responsesPromise.resolve([currentResponseMetadata()]);
          providerMetadataPromise.resolve(value.providerMetadata ?? {});
          break;
        }
      }
    },

    flush() {
      if (!finished) {
        throw new NoSpeechGeneratedError({
          responses: [currentResponseMetadata()],
        });
      }
    },

    cancel(reason) {
      const cancelReason = reason ?? new Error('Speech stream was cancelled.');
      // Reject now rather than when the provider reacts to the abort, which
      // may be late while doStream is still pending.
      rejectPendingPromises(cancelReason);
      pipeAbortController.abort(cancelReason);
    },
  };

  const transform = new TransformStream<
    Experimental_SpeechModelV4StreamPart,
    SpeechStreamPart
  >(transformer);

  // Piping (instead of an eager read loop) preserves consumer backpressure
  // and propagates cancellation of the output stream to the model stream.
  void (async () => {
    const result = await resolvedModel.doStream({
      text: textStream,
      voice,
      outputFormat,
      instructions,
      speed,
      language,
      providerOptions,
      // merged so cancelling the output stream also aborts a pending doStream
      abortSignal: mergeAbortSignals(abortSignal, pipeAbortController.signal),
      headers: headersWithUserAgent,
      includeRawChunks,
    });

    response = {
      timestamp: result.response?.timestamp ?? startedAt,
      modelId: result.response?.modelId ?? resolvedModel.modelId,
      headers: result.response?.headers,
      body: result.response?.body,
    };

    await result.stream.pipeTo(transform.writable, {
      signal: pipeAbortController.signal,
    });
  })().catch(error => {
    const reason =
      error ?? new Error('Speech stream was cancelled or errored.');
    rejectPendingPromises(reason);
    // When doStream rejects before the model took a reader, nothing owns the
    // text stream yet, so cancel it here; otherwise the model's cleanup does.
    textStream.cancel(reason).catch(() => {});
    transform.writable.abort(reason).catch(() => {
      // the writable is already errored when the model stream failed mid-pipe
    });
  });

  // Speech streams can be unbounded (e.g. text from a long-running LLM
  // stream), so the output has exactly one owner and is never buffered.
  let streamOwner:
    | 'unclaimed'
    | 'audio-stream'
    | 'full-stream'
    | 'result-promises' = 'unclaimed';

  function consumeStream() {
    if (streamOwner !== 'unclaimed') {
      return;
    }
    streamOwner = 'result-promises';
    const reader = transform.readable.getReader();
    void (async () => {
      while (!(await reader.read()).done) {
        // drain; results surface via the promises
      }
    })().catch(() => {
      // stream errors reject the promises via the pipe handler above
    });
  }

  function claimStream(owner: 'audio-stream' | 'full-stream') {
    if (streamOwner !== 'unclaimed') {
      throw new Error(
        streamOwner === 'result-promises'
          ? `${owner === 'full-stream' ? 'fullStream' : 'audioStream'} cannot be accessed after a result promise.`
          : 'Only one of audioStream or fullStream can be accessed, and only once.',
      );
    }
    streamOwner = owner;
    return transform.readable;
  }

  return {
    get usage() {
      consumeStream();
      return usagePromise.promise;
    },
    get warnings() {
      consumeStream();
      return warningsPromise.promise;
    },
    get responses() {
      consumeStream();
      return responsesPromise.promise;
    },
    get providerMetadata() {
      consumeStream();
      return providerMetadataPromise.promise;
    },
    get fullStream() {
      return asAsyncIterableStream(claimStream('full-stream'));
    },
    get audioStream() {
      return asAsyncIterableStream(
        claimStream('audio-stream').pipeThrough(
          new TransformStream<SpeechStreamPart, Uint8Array>({
            transform(part, controller) {
              if (part.type === 'audio' && part.audio.length > 0) {
                controller.enqueue(part.audio);
              } else if (part.type === 'error') {
                controller.error(part.error);
              }
            },
          }),
        ),
      );
    },
  };
}

function toTextStream(
  text: string | AsyncIterable<string> | ReadableStream<string>,
): ReadableStream<string> {
  if (typeof text === 'string') {
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });
  }
  if (text instanceof ReadableStream) {
    return text;
  }
  return convertAsyncIteratorToReadableStream(text[Symbol.asyncIterator]());
}
