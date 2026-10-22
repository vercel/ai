import {
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamPart,
  type Experimental_SpeechModelV4StreamTextPart,
  type JSONObject,
  type SharedV4AudioFormat,
} from '@ai-sdk/provider';
import {
  convertAsyncIteratorToReadableStream,
  convertBase64ToUint8Array,
  DelayedPromise,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { NoSpeechGeneratedError } from '../error/no-speech-generated-error';
import { StreamProviderError } from '../error/stream-provider-error';
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
  SpeechTextPart,
  StreamSpeechResult,
} from './stream-speech-result';

/**
 * Streams speech audio using a speech model.
 *
 * @param model - The speech model to use. It must support streaming speech.
 * @param text - The text to convert to speech: a complete string, or a stream of text deltas
 * (e.g. the text stream of `streamText`) or text parts that is synthesized as it arrives.
 * A text part can set its own `voice` on providers that support several voices per stream.
 * @param voice - The voice to use for speech generation.
 * @param outputFormat - The format of the output audio chunks, e.g. `{ type: 'audio/pcm', rate: 24000 }`.
 * @param instructions - Instructions for the speech generation e.g. "Speak in a slow and steady tone".
 * @param speed - The speed of the speech generation.
 * @param language - The language for speech generation (ISO 639-1 code e.g. "en", "es", "fr") or "auto" for automatic detection.
 * @param providerOptions - Additional provider-specific options.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP/WebSocket headers to send when supported by the provider.
 * @param includeRawChunks - When true, raw provider chunks are included in `fullStream`.
 * @param onError - Called for each provider error part; defaults to `console.error`.
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
  onError = ({ error }) => {
    console.error(error);
  },
  _internal: { currentDate = () => new Date() } = {},
}: {
  /**
   * The speech model to use.
   */
  model: SpeechModel;

  /**
   * The text to convert to speech: a complete string, or an array, iterable,
   * or stream of text deltas and/or text parts.
   */
  text:
    | string
    | Iterable<string | SpeechTextPart>
    | AsyncIterable<string | SpeechTextPart>
    | ReadableStream<string | SpeechTextPart>;

  /**
   * The voice to use for speech generation.
   */
  voice?: string;

  /**
   * The desired format of the output audio chunks, e.g.
   * `{ type: 'audio/pcm', rate: 24000 }` or `{ type: 'audio/mpeg' }`.
   * Supported formats are provider-specific.
   */
  outputFormat?: SharedV4AudioFormat;

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
   * Called for each error part the provider reports. Error parts are not
   * fatal: `fullStream` includes them and `audioStream` skips them. The
   * callback is not awaited, and errors it throws are ignored.
   * Defaults to logging the error with `console.error`.
   */
  onError?: (event: { error: unknown }) => void | PromiseLike<void>;

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
            " instance instead (e.g. elevenLabs.speech('eleven_flash_v2_5'))" +
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
  // Kept so a failed stream reports the provider error that caused it.
  let lastError: unknown;

  // A stream that ends without a finish part: when nothing was heard it is a
  // no-speech failure; after audio it surfaces the provider's error instead.
  const incompleteStreamError = () =>
    hasAudio
      ? (lastError ??
        new StreamProviderError({
          message: 'The speech stream ended before it finished.',
        }))
      : new NoSpeechGeneratedError({
          responses: [currentResponseMetadata()],
          cause: lastError,
        });

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

        case 'raw': {
          controller.enqueue(value);
          break;
        }

        case 'error': {
          lastError = value.error;
          void Promise.resolve()
            .then(() => onError({ error: value.error }))
            .catch(() => {});
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
              cause: lastError,
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
        throw incompleteStreamError();
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

  // A user abort settles the result and errors the output immediately, even
  // while doStream is pending or the provider ignores the signal.
  if (abortSignal != null) {
    const onAbort = () => {
      const reason = abortSignal.reason;
      rejectPendingPromises(reason);
      pipeAbortController.abort(reason);
      // Rejects when the pipe already holds the writable; the pipe aborts it.
      transform.writable.abort(reason).catch(() => {});
    };
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

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
        createAudioByteStream(claimStream('audio-stream')),
      );
    },
  };
}

/**
 * Projects speech parts to audio bytes with a pull-based stream rather than a
 * second `pipeThrough`, so an early consumer cancel cancels the part stream
 * directly instead of surfacing an unhandled rejection from a chained pipe.
 */
function createAudioByteStream(
  parts: ReadableStream<SpeechStreamPart>,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<SpeechStreamPart> | undefined;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      reader ??= parts.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        // Error parts are non-fatal (reported via `onError`), as for the
        // text stream of `streamText`; only stream failures end the audio.
        if (value.type === 'audio' && value.audio.length > 0) {
          controller.enqueue(value.audio);
          return;
        }
      }
    },
    async cancel(reason) {
      // Aborting the active model pipe can reject the part stream's cancel
      // promise; result promises already surface that cancellation reason.
      if (reader != null) {
        await reader.cancel(reason).catch(() => {});
      } else {
        await parts.cancel(reason).catch(() => {});
      }
    },
  });
}

function toTextStream(
  text:
    | string
    | Iterable<string | SpeechTextPart>
    | AsyncIterable<string | SpeechTextPart>
    | ReadableStream<string | SpeechTextPart>,
): ReadableStream<Experimental_SpeechModelV4StreamTextPart> {
  if (typeof text === 'string') {
    return new ReadableStream<Experimental_SpeechModelV4StreamTextPart>({
      start(controller) {
        controller.enqueue({ type: 'text', text });
        controller.close();
      },
    });
  }
  const source = toSourceStream(text);
  return source.pipeThrough(
    new TransformStream<
      string | SpeechTextPart,
      Experimental_SpeechModelV4StreamTextPart
    >({
      transform(value, controller) {
        controller.enqueue(toTextPart(value));
      },
    }),
  );
}

function toSourceStream(
  text:
    | Iterable<string | SpeechTextPart>
    | AsyncIterable<string | SpeechTextPart>
    | ReadableStream<string | SpeechTextPart>,
): ReadableStream<string | SpeechTextPart> {
  if (text instanceof ReadableStream) {
    return text;
  }
  if (
    typeof (text as Partial<AsyncIterable<unknown>>)?.[Symbol.asyncIterator] ===
    'function'
  ) {
    const iterable = text as AsyncIterable<string | SpeechTextPart>;
    return convertAsyncIteratorToReadableStream(
      iterable[Symbol.asyncIterator](),
    );
  }
  if (
    typeof (text as Partial<Iterable<unknown>>)?.[Symbol.iterator] ===
    'function'
  ) {
    const iterable = text as Iterable<string | SpeechTextPart>;
    return convertAsyncIteratorToReadableStream(
      (async function* () {
        yield* iterable;
      })(),
    );
  }
  throw new InvalidArgumentError({
    parameter: 'text',
    value: text,
    message:
      'Expected a string, an iterable or async iterable, or a ReadableStream of strings or text parts.',
  });
}

function toTextPart(
  value: string | SpeechTextPart,
): Experimental_SpeechModelV4StreamTextPart {
  if (typeof value === 'string') {
    return { type: 'text', text: value };
  }
  return {
    type: 'text',
    text: value.text,
    ...(value.voice != null && { voice: value.voice }),
    ...(value.providerOptions != null && {
      providerOptions: value.providerOptions,
    }),
  };
}
