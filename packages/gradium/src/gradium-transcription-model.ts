import type { TranscriptionModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { GradiumSTTMessage } from './gradium-api-types';
import { cleanHeaders, type GradiumConfig } from './gradium-config';
import { gradiumFailedResponseHandler } from './gradium-error';
import type { GradiumTranscriptionModelId } from './gradium-transcription-options';
import { gradiumTranscriptionModelOptionsSchema } from './gradium-transcription-model-options';

/**
 * Map an IANA media type to the value Gradium expects for `Content-Type`.
 * Gradium accepts `audio/wav`, `audio/pcm`, `audio/ogg`, `audio/opus`.
 * Anything else is sent through as-is — Gradium will reject unsupported
 * types with a 500 + plain-text error which our error handler surfaces.
 */
function mapMediaType(mediaType: string): {
  contentType: string;
  warnings: SharedV4Warning[];
} {
  const lowered = mediaType.toLowerCase();
  if (
    lowered === 'audio/wav' ||
    lowered === 'audio/x-wav' ||
    lowered === 'audio/wave'
  ) {
    return { contentType: 'audio/wav', warnings: [] };
  }
  if (lowered === 'audio/pcm') {
    return { contentType: 'audio/pcm', warnings: [] };
  }
  if (lowered === 'audio/ogg' || lowered === 'audio/opus') {
    return { contentType: 'audio/ogg', warnings: [] };
  }
  if (lowered === 'audio/mpeg' || lowered === 'audio/mp3') {
    return {
      contentType: lowered,
      warnings: [
        {
          type: 'unsupported',
          feature: 'mediaType',
          details: `Gradium does not currently accept ${lowered}. Re-encode to wav/pcm/opus client-side; the request will fail otherwise.`,
        },
      ],
    };
  }
  return { contentType: mediaType, warnings: [] };
}

/**
 * Decode `audio` (base64 string or `Uint8Array`) into a `Uint8Array`.
 * The AI SDK accepts either form for transcription input.
 */
function toUint8Array(audio: Uint8Array | string): Uint8Array {
  if (audio instanceof Uint8Array) return audio;
  // Base64 → Uint8Array. Works in both Node 16+ and edge runtimes.
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(audio, 'base64'));
  }
  const binary = atob(audio);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Parse Gradium's NDJSON STT response into a flat list of messages.
 * Empty lines are skipped; malformed lines are surfaced as a thrown
 * error since Gradium's stream contract guarantees one JSON per line.
 */
function parseNdjson(body: string): GradiumSTTMessage[] {
  const out: GradiumSTTMessage[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      out.push(JSON.parse(line) as GradiumSTTMessage);
    } catch {
      throw new Error(
        `Gradium returned a malformed NDJSON line: ${line.slice(0, 200)}`,
      );
    }
  }
  return out;
}

/**
 * Fold a list of NDJSON messages into the AI SDK transcription result
 * shape. `text` segments pair with their following `end_text` to form
 * a `{ text, startSecond, endSecond }` segment; segments without an
 * end_text get `endSecond = startSecond` so they're still useful.
 */
function foldMessages(messages: GradiumSTTMessage[]): {
  text: string;
  segments: Array<{ text: string; startSecond: number; endSecond: number }>;
  errorMessage?: string;
} {
  const segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }> = [];
  let pending: { text: string; startSecond: number } | null = null;
  let errorMessage: string | undefined;

  for (const msg of messages) {
    if (msg.type === 'text') {
      if (pending) {
        // Previous segment never got an explicit end_text; close it
        // off using its own start time as the end.
        segments.push({
          text: pending.text,
          startSecond: pending.startSecond,
          endSecond: pending.startSecond,
        });
      }
      pending = { text: msg.text, startSecond: msg.start_s };
    } else if (msg.type === 'end_text' && pending) {
      segments.push({
        text: pending.text,
        startSecond: pending.startSecond,
        endSecond: msg.stop_s,
      });
      pending = null;
    } else if (msg.type === 'error') {
      errorMessage = msg.message;
    }
  }
  if (pending) {
    segments.push({
      text: pending.text,
      startSecond: pending.startSecond,
      endSecond: pending.startSecond,
    });
  }

  return {
    text: segments.map(s => s.text).join(' '),
    segments,
    errorMessage,
  };
}

export class GradiumTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: GradiumTranscriptionModelId;

  private readonly config: GradiumConfig;

  static [WORKFLOW_SERIALIZE](model: GradiumTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GradiumTranscriptionModelId;
    config: GradiumConfig;
  }) {
    return new GradiumTranscriptionModel(options.modelId, options.config);
  }

  constructor(modelId: GradiumTranscriptionModelId, config: GradiumConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const warnings: SharedV4Warning[] = [];

    const gradiumOpts =
      (await parseProviderOptions({
        provider: 'gradium',
        providerOptions: options.providerOptions,
        schema: gradiumTranscriptionModelOptionsSchema,
      })) ?? {};

    const { contentType, warnings: ctWarnings } = mapMediaType(
      options.mediaType,
    );
    warnings.push(...ctWarnings);

    // Build query string — model + input_format + json_config.
    const url = new URL(
      this.config.url({
        path: '/post/speech/asr',
        modelId: this.modelId,
      }),
    );
    if (this.modelId !== 'default') {
      url.searchParams.set('model', this.modelId);
    }
    if (gradiumOpts.inputFormat) {
      url.searchParams.set('input_format', gradiumOpts.inputFormat);
    }
    let jsonConfig = gradiumOpts.jsonConfig ?? undefined;
    if (jsonConfig == null && gradiumOpts.language) {
      jsonConfig = JSON.stringify({ language: gradiumOpts.language });
    } else if (jsonConfig != null && gradiumOpts.language) {
      warnings.push({
        type: 'other',
        message:
          'providerOptions.gradium.jsonConfig was provided; `language` was ignored to avoid conflicts.',
      });
    }
    if (jsonConfig) url.searchParams.set('json_config', jsonConfig);

    const audioBytes = toUint8Array(options.audio);

    const requestHeaders = combineHeaders(
      this.config.headers(),
      { 'content-type': contentType },
      options.headers,
    );

    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: cleanHeaders(requestHeaders),
      // Cast around TS 5.x's tighter Uint8Array<ArrayBuffer> constraint.
      body: audioBytes as unknown as BodyInit,
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorResult = await gradiumFailedResponseHandler({
        response,
        url: url.toString(),
        requestBodyValues: { mediaType: options.mediaType },
      });
      throw errorResult.value;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const body = await response.text();
    const messages = parseNdjson(body);
    const { text, segments, errorMessage } = foldMessages(messages);

    if (errorMessage) {
      // Mid-stream error — surface as a regular `unsupported` warning
      // alongside whatever partial transcript came through.
      warnings.push({ type: 'other', message: errorMessage });
    }

    return {
      text,
      segments,
      language: gradiumOpts.language ?? undefined,
      durationInSeconds:
        segments.length > 0
          ? segments[segments.length - 1]!.endSecond
          : undefined,
      warnings,
      request: { body: undefined },
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
        body,
      },
      providerMetadata: {
        gradium: {
          messageCount: messages.length,
        },
      },
    };
  }
}
