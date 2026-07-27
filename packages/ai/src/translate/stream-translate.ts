import type {
  Experimental_SpeechTranslationModelV4StreamPart,
  Experimental_SpeechTranslationModelV4Usage,
  JSONObject,
  SharedV4AudioFormat,
} from '@ai-sdk/provider';
import {
  DelayedPromise,
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoTranslationGeneratedError } from '../error/no-translation-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveSpeechTranslationModel } from '../model/resolve-model';
import type { SpeechTranslationModel } from '../types/speech-translation-model';
import type { SpeechTranslationModelResponseMetadata } from '../types/speech-translation-model-response-metadata';
import type { Warning } from '../types/warning';
import { asAsyncIterableStream } from '../util/async-iterable-stream';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { VERSION } from '../version';
import type {
  StreamTranslationResult,
  TranslationStreamPart,
} from './stream-translate-result';

/**
 * Streams speech-to-speech translations using a speech translation model.
 *
 * @param model - The speech translation model to use.
 * @param audio - Raw audio chunks to translate.
 * @param inputAudioFormat - The input audio format for the raw audio chunks.
 * @param targetLanguage - The language to translate the audio into.
 * @param sourceLanguage - The language of the source audio. Auto-detected when absent.
 * @param outputAudioFormat - The desired audio format for translated audio chunks.
 * @param providerOptions - Additional provider-specific options.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP/WebSocket headers to send when supported by the provider.
 * @param includeRawChunks - When true, providers include raw provider chunks in the stream as `raw` parts.
 *
 * @returns A result object that contains the streaming translation and final translation metadata.
 */
export function streamTranslate({
  model,
  audio,
  inputAudioFormat,
  targetLanguage,
  sourceLanguage,
  outputAudioFormat,
  providerOptions = {},
  abortSignal,
  headers,
  includeRawChunks,
  _internal: { currentDate = () => new Date() } = {},
}: {
  /**
   * The speech translation model to use.
   */
  model: SpeechTranslationModel;

  /**
   * Raw audio chunks to translate.
   */
  audio: ReadableStream<Uint8Array | string>;

  /**
   * The input audio format for the raw audio chunks.
   */
  inputAudioFormat: SharedV4AudioFormat;

  /**
   * The language to translate the audio into, as a BCP-47-style language
   * tag (e.g. `en`, `es`, `fr-CA`). Supported values are provider-specific
   * and validated by the provider.
   */
  targetLanguage: string;

  /**
   * The language of the source audio, as a BCP-47-style language tag.
   * When absent, providers auto-detect the source language.
   */
  sourceLanguage?: string;

  /**
   * The desired audio format for translated audio chunks.
   * When absent, the provider default output format is used.
   */
  outputAudioFormat?: SharedV4AudioFormat;

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
}): StreamTranslationResult {
  const resolvedModel = resolveSpeechTranslationModel(model);

  const doStream = resolvedModel.doStream.bind(resolvedModel);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const sourceTextPromise = new DelayedPromise<string>();
  const translationTextPromise = new DelayedPromise<string>();
  const durationInSecondsPromise = new DelayedPromise<number | undefined>();
  const usagePromise = new DelayedPromise<
    Experimental_SpeechTranslationModelV4Usage | undefined
  >();
  const warningsPromise = new DelayedPromise<Array<Warning>>();
  const responsePromise =
    new DelayedPromise<SpeechTranslationModelResponseMetadata>();
  const providerMetadataPromise = new DelayedPromise<
    Record<string, JSONObject>
  >();

  const rejectPendingPromises = (error: unknown) => {
    for (const promise of [
      sourceTextPromise,
      translationTextPromise,
      durationInSecondsPromise,
      usagePromise,
      warningsPromise,
      responsePromise,
      providerMetadataPromise,
    ]) {
      if (promise.isPending()) {
        promise.reject(error);
      }
    }
  };

  const startedAt = currentDate();
  let response: SpeechTranslationModelResponseMetadata | undefined;
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

  // When the consumer cancels `fullStream` early, we abort the model pipe below
  // with a defined reason via this controller. Relying on the default cancel
  // cascade aborts the pipe with an `undefined` reason, which surfaces as a
  // spurious unhandled rejection on Node.js 26 when the transform drops chunks.
  const pipeAbortController = new AbortController();

  // A stream is successful when at least one `audio` part was emitted or the
  // final `outputText` is non-empty (audio-only providers may report an empty
  // `outputText`).
  let hasAudioOutput = false;

  // `Transformer.cancel` is part of the Streams spec (and supported at runtime),
  // but not yet reflected in the ambient `Transformer` type, so widen it here.
  const transformer: Transformer<
    Experimental_SpeechTranslationModelV4StreamPart,
    TranslationStreamPart
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
          };
          break;
        }

        case 'audio': {
          hasAudioOutput = true;
          controller.enqueue(value);
          break;
        }

        case 'output-text-delta':
        case 'output-text-final':
        case 'source-transcript-delta':
        case 'source-transcript-partial':
        case 'source-transcript-final':
        case 'raw':
        case 'error': {
          controller.enqueue(value);
          break;
        }

        case 'finish': {
          if (!warningsPromise.isResolved()) {
            resolveWarnings([]);
          }

          if (!hasAudioOutput && !value.outputText) {
            throw new NoTranslationGeneratedError({
              response: currentResponseMetadata(),
            });
          }

          sourceTextPromise.resolve(value.sourceText);
          translationTextPromise.resolve(value.outputText);
          durationInSecondsPromise.resolve(value.durationInSeconds);
          usagePromise.resolve(value.usage);
          responsePromise.resolve(currentResponseMetadata());
          providerMetadataPromise.resolve(value.providerMetadata ?? {});
          break;
        }

        default: {
          const _exhaustiveCheck: never = value;
          throw new Error(`Unsupported part type: ${_exhaustiveCheck}`);
        }
      }
    },

    flush() {
      if (translationTextPromise.isPending()) {
        throw new NoTranslationGeneratedError({
          response: currentResponseMetadata(),
        });
      }
    },

    cancel(reason) {
      pipeAbortController.abort(
        reason ?? new Error('Translation stream was cancelled.'),
      );
    },
  };

  const transform = new TransformStream<
    Experimental_SpeechTranslationModelV4StreamPart,
    TranslationStreamPart
  >(transformer);

  // Piping (instead of an eager read loop) preserves consumer backpressure
  // and propagates cancellation of `fullStream` to the model stream.
  void (async () => {
    const result = await doStream({
      audio,
      inputAudioFormat,
      targetLanguage,
      sourceLanguage,
      outputAudioFormat,
      providerOptions,
      // merged so cancelling fullStream also aborts a still-pending doStream
      abortSignal: mergeAbortSignals(abortSignal, pipeAbortController.signal),
      headers: headersWithUserAgent,
      includeRawChunks,
    });

    response = {
      timestamp: result.response?.timestamp ?? startedAt,
      modelId: result.response?.modelId ?? resolvedModel.modelId,
      headers: result.response?.headers,
    };

    await result.stream.pipeTo(transform.writable, {
      signal: pipeAbortController.signal,
    });
  })().catch(error => {
    const reason =
      error ?? new Error('Translation stream was cancelled or errored.');
    rejectPendingPromises(reason);
    // When `doStream` rejects before the model stream exists (e.g. auth or
    // header resolution failure), nothing has taken ownership of `audio` yet,
    // so cancel it directly — otherwise an upstream producer piping into it
    // hangs forever. When the model did take a reader, `audio` is locked and
    // the cancel rejects, which is fine: the model's cleanup owns it then.
    audio.cancel(reason).catch(() => {});
    transform.writable.abort(reason).catch(() => {
      // the writable is already errored when the model stream failed mid-pipe
    });
  });

  // Translation streams can be unbounded (live microphone + raw chunks), so
  // unlike streamText we cannot retain an unread tee branch for replay. The
  // output stream has one owner: either fullStream, or the first result promise
  // getter which claims and drains it internally.
  let streamOwner: 'unclaimed' | 'full-stream' | 'result-promises' =
    'unclaimed';

  function consumeStream() {
    if (streamOwner === 'full-stream' || streamOwner === 'result-promises') {
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

  function getFullStream() {
    if (streamOwner !== 'unclaimed') {
      throw new Error(
        streamOwner === 'full-stream'
          ? 'fullStream can only be accessed once.'
          : 'fullStream cannot be accessed after a result promise.',
      );
    }
    streamOwner = 'full-stream';
    // Direct ownership preserves backpressure and cancellation: cancelling
    // this stream reaches Transformer.cancel and aborts the model pipe.
    return asAsyncIterableStream(transform.readable);
  }

  return {
    get sourceText() {
      consumeStream();
      return sourceTextPromise.promise;
    },
    get translationText() {
      consumeStream();
      return translationTextPromise.promise;
    },
    get durationInSeconds() {
      consumeStream();
      return durationInSecondsPromise.promise;
    },
    get usage() {
      consumeStream();
      return usagePromise.promise;
    },
    get warnings() {
      consumeStream();
      return warningsPromise.promise;
    },
    get response() {
      consumeStream();
      return responsePromise.promise;
    },
    get providerMetadata() {
      consumeStream();
      return providerMetadataPromise.promise;
    },
    get fullStream() {
      return getFullStream();
    },
  };
}
