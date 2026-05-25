import { combineHeaders } from '@ai-sdk/provider-utils';
import { cleanHeaders, type GradiumConfig } from './gradium-config';
import { gradiumFailedResponseHandler } from './gradium-error';

export interface GradiumVoiceTag {
  category?: string | null;
  value: string;
}

export interface GradiumVoice {
  uid: string;
  name: string;
  description?: string | null;
  filename?: string | null;
  start_s?: number | null;
  is_catalog: boolean;
  is_pro_clone: boolean;
  language?: string | null;
  tags: GradiumVoiceTag[];
}

export interface GradiumVoiceListOptions {
  /** Pagination offset. */
  skip?: number;
  /** Page size. Default 100. */
  limit?: number;
  /** Include Gradium's curated catalog voices alongside org-owned voices. */
  includeCatalog?: boolean;
}

export interface GradiumVoiceCreateOptions {
  /** Display name for the voice. */
  name: string;
  /** Audio sample. Pass a `Blob` (browser/edge) or a `Uint8Array` (node). */
  audioFile: Blob | Uint8Array;
  /**
   * Optional filename hint when passing `Uint8Array`. Determines the
   * `audio_file` part name and helps Gradium infer `input_format`.
   */
  audioFileName?: string;
  /** Audio MIME type (e.g. `'audio/wav'`). Optional when filename is set. */
  audioContentType?: string;
  /** Override the input format inferred from filename (`wav`/`pcm`/`opus`). */
  inputFormat?: string;
  /** Free-form description shown alongside the voice. */
  description?: string;
  /** Voice language hint (ISO 639-1, e.g. `'en'`). */
  language?: string;
  /** Trim audio before this many seconds. Default 0. */
  startSeconds?: number;
  /** Cap analysis at this many seconds. Default 10. */
  timeoutSeconds?: number;
}

export interface GradiumVoiceUpdateOptions {
  name?: string | null;
  description?: string | null;
  language?: string | null;
}

/** Surface presented as `gradium.voices` on the provider object. */
export interface GradiumVoicesAPI {
  list(options?: GradiumVoiceListOptions): Promise<GradiumVoice[]>;
  get(voiceUid: string): Promise<GradiumVoice>;
  create(options: GradiumVoiceCreateOptions): Promise<GradiumVoice>;
  update(
    voiceUid: string,
    options: GradiumVoiceUpdateOptions,
  ): Promise<GradiumVoice>;
  delete(voiceUid: string): Promise<void>;
}

async function ensureOk(response: Response, url: string): Promise<void> {
  if (response.ok) return;
  const errorResult = await gradiumFailedResponseHandler({
    response,
    url,
    requestBodyValues: undefined,
  });
  throw errorResult.value;
}

export function createGradiumVoicesAPI(
  config: GradiumConfig,
): GradiumVoicesAPI {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const baseHeaders = () => config.headers();

  return {
    async list({ skip, limit, includeCatalog } = {}): Promise<GradiumVoice[]> {
      const url = new URL(config.url({ path: '/voices/', modelId: '' }));
      if (skip != null) url.searchParams.set('skip', String(skip));
      if (limit != null) url.searchParams.set('limit', String(limit));
      if (includeCatalog != null) {
        url.searchParams.set('include_catalog', String(includeCatalog));
      }
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: baseHeaders(),
      });
      await ensureOk(res, url.toString());
      return (await res.json()) as GradiumVoice[];
    },

    async get(voiceUid: string): Promise<GradiumVoice> {
      const url = config.url({
        path: `/voices/${encodeURIComponent(voiceUid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: baseHeaders(),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumVoice;
    },

    async create(options: GradiumVoiceCreateOptions): Promise<GradiumVoice> {
      const url = config.url({ path: '/voices/', modelId: '' });

      const form = new FormData();
      const filename = options.audioFileName ?? 'voice.wav';
      const contentType = options.audioContentType ?? 'audio/wav';

      const blob =
        options.audioFile instanceof Blob
          ? options.audioFile
          : new Blob([options.audioFile as unknown as BlobPart], {
              type: contentType,
            });

      form.append('audio_file', blob, filename);
      form.append('name', options.name);
      if (options.inputFormat) form.append('input_format', options.inputFormat);
      if (options.description) form.append('description', options.description);
      if (options.language) form.append('language', options.language);
      if (options.startSeconds != null) {
        form.append('start_s', String(options.startSeconds));
      }
      if (options.timeoutSeconds != null) {
        form.append('timeout_s', String(options.timeoutSeconds));
      }

      // Don't set Content-Type — fetch will add the multipart boundary.
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: baseHeaders(),
        body: form,
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumVoice;
    },

    async update(
      voiceUid: string,
      options: GradiumVoiceUpdateOptions,
    ): Promise<GradiumVoice> {
      const url = config.url({
        path: `/voices/${encodeURIComponent(voiceUid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'PUT',
        headers: cleanHeaders(
          combineHeaders(baseHeaders(), {
            'content-type': 'application/json',
          }),
        ),
        body: JSON.stringify(options),
      });
      await ensureOk(res, url);
      return (await res.json()) as GradiumVoice;
    },

    async delete(voiceUid: string): Promise<void> {
      const url = config.url({
        path: `/voices/${encodeURIComponent(voiceUid)}`,
        modelId: '',
      });
      const res = await fetchImpl(url, {
        method: 'DELETE',
        headers: baseHeaders(),
      });
      await ensureOk(res, url);
    },
  };
}
