import type {
  SharedV4Warning,
  TranscriptionModelV4,
  TranscriptionModelV4StreamOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  getWebSocketConstructor,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  safeParseJSON,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import {
  xaiTranscriptionModelOptionsSchema,
  type XaiTranscriptionModelOptions,
} from './xai-transcription-model-options';

interface XaiTranscriptionModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  webSocket?: WebSocketConstructor;
  _internal?: {
    currentDate?: () => Date;
  };
}

type XaiStreamingTranscriptionEvent = {
  type?: string;
  text?: string;
  words?: Array<{ text?: string; start?: number; end?: number }>;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel_index?: number;
  message?: string;
};

export class XaiTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: XaiTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: '';
    config: XaiTranscriptionModelConfig;
  }) {
    return new XaiTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: XaiTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions,
      schema: xaiTranscriptionModelOptionsSchema,
    });

    const formData = new FormData();
    const transcriptionOptions = {
      audio_format: xaiOptions?.audioFormat,
      sample_rate: xaiOptions?.sampleRate,
      language: xaiOptions?.language,
      format: xaiOptions?.format,
      multichannel: xaiOptions?.multichannel,
      channels: xaiOptions?.channels,
      diarize: xaiOptions?.diarize,
      filler_words: xaiOptions?.fillerWords,
    };

    for (const [key, value] of Object.entries(transcriptionOptions)) {
      if (value != null) {
        formData.append(key, String(value));
      }
    }

    if (xaiOptions?.keyterm != null) {
      const keyterms = Array.isArray(xaiOptions.keyterm)
        ? xaiOptions.keyterm
        : [xaiOptions.keyterm];

      for (const keyterm of keyterms) {
        formData.append('keyterm', keyterm);
      }
    }

    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);
    const fileExtension = mediaTypeToExtension(mediaType);

    // xAI requires `file` to be the final multipart field.
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    return { formData, warnings };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/stt`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: response.language || undefined,
      durationInSeconds: response.duration ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }

  async doStream(
    options: TranscriptionModelV4StreamOptions,
  ): Promise<
    Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiTranscriptionModelOptionsSchema,
    });

    if (xaiOptions?.format != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'providerOptions.xai.format',
        details: 'xAI streaming transcription does not support format.',
      });
    }

    const url = buildXaiStreamingTranscriptionUrl({
      baseURL: this.config.baseURL ?? 'https://api.x.ai/v1',
      inputAudioFormat: options.inputAudioFormat,
      providerOptions: xaiOptions,
    });
    const headers = combineHeaders(this.config.headers?.(), options.headers);

    return {
      request: { body: url.toString() },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
      },
      stream: new ReadableStream({
        start: controller => {
          const WebSocketConstructor = getWebSocketConstructor(
            this.config.webSocket,
          );
          const ws = new WebSocketConstructor(url, undefined, { headers });
          const expectedDoneCount =
            xaiOptions?.multichannel === true ? (xaiOptions.channels ?? 1) : 1;
          const doneTexts = new Map<number, string>();
          let doneDuration: number | undefined;
          let finished = false;

          const finishWithError = (error: unknown) => {
            if (finished) return;
            finished = true;
            try {
              ws.close();
            } catch {}
            controller.error(error);
          };

          const maybeFinish = () => {
            if (finished || doneTexts.size < expectedDoneCount) return;
            finished = true;
            const text = [...doneTexts.entries()]
              .sort(([a], [b]) => a - b)
              .map(([, value]) => value)
              .join('\n');
            controller.enqueue({
              type: 'finish',
              text,
              segments: [],
              language: xaiOptions?.language ?? undefined,
              durationInSeconds: doneDuration,
            });
            controller.close();
            try {
              ws.close(1000);
            } catch {}
          };

          const abort = () => {
            finishWithError(
              options.abortSignal?.reason ?? new Error('Aborted'),
            );
          };
          if (options.abortSignal?.aborted) {
            abort();
            return;
          }
          options.abortSignal?.addEventListener('abort', abort, { once: true });

          ws.onmessage = event => {
            void readWebSocketText(event.data)
              .then(async text => {
                const parsed = await safeParseJSON({ text });
                if (!parsed.success) return;
                const raw = parsed.value as XaiStreamingTranscriptionEvent;

                if (options.includeRawChunks) {
                  controller.enqueue({ type: 'raw', rawValue: raw });
                }

                switch (raw.type) {
                  case 'transcript.created': {
                    controller.enqueue({ type: 'stream-start', warnings });
                    void sendXaiAudioStream({
                      audio: options.audio,
                      send: chunk => ws.send(chunk),
                      done: () =>
                        ws.send(JSON.stringify({ type: 'audio.done' })),
                    }).catch(finishWithError);
                    break;
                  }

                  case 'transcript.partial': {
                    const id = channelId(raw.channel_index);
                    const timing = timingFromXaiEvent(raw);
                    if (raw.is_final) {
                      controller.enqueue({
                        type: 'transcript-final',
                        id,
                        text: raw.text ?? '',
                        ...timing,
                        channelIndex: raw.channel_index,
                      });
                    } else {
                      controller.enqueue({
                        type: 'transcript-partial',
                        id,
                        text: raw.text ?? '',
                        startSecond: raw.start,
                        durationInSeconds: raw.duration,
                        channelIndex: raw.channel_index,
                      });
                    }
                    break;
                  }

                  case 'transcript.done': {
                    const channelIndex = raw.channel_index ?? 0;
                    doneTexts.set(channelIndex, raw.text ?? '');
                    doneDuration = raw.duration ?? doneDuration;
                    controller.enqueue({
                      type: 'transcript-final',
                      id: channelId(raw.channel_index),
                      text: raw.text ?? '',
                      channelIndex: raw.channel_index,
                    });
                    maybeFinish();
                    break;
                  }

                  case 'error': {
                    const error = new Error(raw.message ?? 'xAI STT error');
                    controller.enqueue({ type: 'error', error });
                    break;
                  }
                }
              })
              .catch(finishWithError);
          };

          ws.onerror = () => {
            finishWithError(new Error('xAI streaming transcription error'));
          };

          ws.onclose = () => {
            options.abortSignal?.removeEventListener('abort', abort);
            if (!finished) {
              controller.close();
            }
          };
        },
      }),
    };
  }
}

function buildXaiStreamingTranscriptionUrl({
  baseURL,
  inputAudioFormat,
  providerOptions,
}: {
  baseURL: string;
  inputAudioFormat: TranscriptionModelV4StreamOptions['inputAudioFormat'];
  providerOptions: XaiTranscriptionModelOptions | undefined;
}) {
  const url = new URL(`${baseURL}/stt`);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  appendSearchParam(
    url,
    'sample_rate',
    providerOptions?.sampleRate ?? inputAudioFormat.rate,
  );
  appendSearchParam(
    url,
    'encoding',
    providerOptions?.audioFormat ??
      encodingFromInputAudioFormat(inputAudioFormat.type),
  );
  appendSearchParam(url, 'language', providerOptions?.language);
  appendSearchParam(url, 'diarize', providerOptions?.diarize);
  appendSearchParam(url, 'filler_words', providerOptions?.fillerWords);
  appendSearchParam(url, 'multichannel', providerOptions?.multichannel);
  appendSearchParam(url, 'channels', providerOptions?.channels);
  appendSearchParam(
    url,
    'interim_results',
    providerOptions?.streaming?.interimResults,
  );
  appendSearchParam(
    url,
    'endpointing',
    providerOptions?.streaming?.endpointing,
  );
  appendSearchParam(url, 'smart_turn', providerOptions?.streaming?.smartTurn);
  appendSearchParam(
    url,
    'smart_turn_timeout',
    providerOptions?.streaming?.smartTurnTimeout,
  );

  if (providerOptions?.keyterm != null) {
    const keyterms = Array.isArray(providerOptions.keyterm)
      ? providerOptions.keyterm
      : [providerOptions.keyterm];
    for (const keyterm of keyterms) {
      url.searchParams.append('keyterm', keyterm);
    }
  }

  return url;
}

function appendSearchParam(
  url: URL,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value != null) {
    url.searchParams.set(key, String(value));
  }
}

function encodingFromInputAudioFormat(type: string): 'pcm' | 'mulaw' | 'alaw' {
  switch (type) {
    case 'audio/pcmu':
      return 'mulaw';
    case 'audio/pcma':
      return 'alaw';
    default:
      return 'pcm';
  }
}

async function sendXaiAudioStream({
  audio,
  send,
  done,
}: {
  audio: ReadableStream<Uint8Array | string>;
  send: (chunk: Uint8Array) => void;
  done: () => void;
}) {
  const reader = audio.getReader();
  try {
    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      send(
        value instanceof Uint8Array ? value : convertBase64ToUint8Array(value),
      );
    }
  } finally {
    reader.releaseLock();
  }
  done();
}

function channelId(channelIndex: number | undefined): string | undefined {
  return channelIndex == null ? undefined : `channel-${channelIndex}`;
}

function timingFromXaiEvent(event: XaiStreamingTranscriptionEvent) {
  return {
    ...(event.start != null ? { startSecond: event.start } : {}),
    ...(event.start != null && event.duration != null
      ? { endSecond: event.start + event.duration }
      : {}),
  };
}

async function readWebSocketText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.text();
  }
  return String(data);
}

const xaiTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});
