import {
  combineHeaders,
  createJsonResponseHandler,
  deleteFromApi,
  getFromApi,
  lazySchema,
  postJsonToApi,
  validateTypes,
  zodSchema,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';

const audioSchema = z.object({ data: z.string(), mimeType: z.string() });
const voiceMetadataSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  languageCode: z.string().optional(),
  regionCode: z.string().optional(),
  accent: z.string().optional(),
  gender: z.string().optional(),
  persona: z.string().optional(),
  context: z.string().optional(),
  pitch: z.enum(['low', 'medium', 'high']).optional(),
  model: z.string().optional(),
  sampleAudio: audioSchema.optional(),
});

const createVoiceSchema = z.union([
  z.object({
    store: z.literal(true),
    voice: voiceMetadataSchema.extend({
      type: z.literal('prompted'),
      prompted: z.object({ input: z.string().min(1) }),
    }),
  }),
  z.object({
    store: z.boolean().optional(),
    voice: voiceMetadataSchema.extend({
      type: z.literal('replicated'),
      replicated: z.object({
        consentAudio: audioSchema,
        sourceAudio: audioSchema,
      }),
    }),
  }),
]);

const listVoicesSchema = z.object({
  pageSize: z.number().int().positive().optional(),
  pageToken: z.string().optional(),
  search: z.string().optional(),
  type: z.array(z.enum(['prebuilt', 'prompted', 'replicated'])).optional(),
  languageCode: z.array(z.string()).optional(),
  regionCode: z.array(z.string()).optional(),
  accent: z.array(z.string()).optional(),
  gender: z.array(z.string()).optional(),
  persona: z.array(z.string()).optional(),
  context: z.array(z.string()).optional(),
  pitch: z.array(z.enum(['low', 'medium', 'high'])).optional(),
});

const voiceResponseSchema = z.object({
  type: z.string(),
  id: z.string().nullish(),
  key: z.string().nullish(),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  language_code: z.string().nullish(),
  region_code: z.string().nullish(),
  accent: z.string().nullish(),
  gender: z.string().nullish(),
  persona: z.string().nullish(),
  context: z.string().nullish(),
  pitch: z.string().nullish(),
  model: z.string().nullish(),
  expire_time: z.string().nullish(),
  prompted: z.object({ input: z.string() }).nullish(),
  sample_audio: z.object({ data: z.string(), mime_type: z.string() }).nullish(),
});

function convertVoice(voice: z.infer<typeof voiceResponseSchema>) {
  return {
    type: voice.type,
    id: voice.id,
    key: voice.key,
    displayName: voice.display_name,
    description: voice.description,
    languageCode: voice.language_code,
    regionCode: voice.region_code,
    accent: voice.accent,
    gender: voice.gender,
    persona: voice.persona,
    context: voice.context,
    pitch: voice.pitch,
    model: voice.model,
    expireTime: voice.expire_time,
    prompted: voice.prompted,
    sampleAudio:
      voice.sample_audio == null
        ? voice.sample_audio
        : {
            data: voice.sample_audio.data,
            mimeType: voice.sample_audio.mime_type,
          },
  };
}

export type GoogleVoice = ReturnType<typeof convertVoice>;

export type GoogleVoicesRequestOptions = {
  headers?: Record<string, string>;
  abortSignal?: AbortSignal;
};

export type GoogleCreateVoiceOptions = z.infer<typeof createVoiceSchema> &
  GoogleVoicesRequestOptions;
export type GoogleListVoicesOptions = z.infer<typeof listVoicesSchema> &
  GoogleVoicesRequestOptions;

/** Google-specific voice design and voice management resource. */
export class GoogleVoices {
  constructor(
    private readonly config: {
      baseURL: string;
      headers: () => Record<string, string | undefined>;
      fetch?: FetchFunction;
    },
  ) {}

  async create(options: GoogleCreateVoiceOptions): Promise<GoogleVoice> {
    const { voice, store } = await validateTypes({
      value: options,
      schema: createVoiceSchema,
    });
    const { value } = await postJsonToApi({
      url: `${this.config.baseURL}/voices`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        store,
        voice: {
          type: voice.type,
          display_name: voice.displayName,
          description: voice.description,
          language_code: voice.languageCode,
          region_code: voice.regionCode,
          accent: voice.accent,
          gender: voice.gender,
          persona: voice.persona,
          context: voice.context,
          pitch: voice.pitch,
          model: voice.model,
          sample_audio:
            voice.sampleAudio == null
              ? undefined
              : {
                  data: voice.sampleAudio.data,
                  mime_type: voice.sampleAudio.mimeType,
                },
          ...(voice.type === 'prompted'
            ? { prompted: voice.prompted }
            : {
                replicated: {
                  consent_audio: {
                    data: voice.replicated.consentAudio.data,
                    mime_type: voice.replicated.consentAudio.mimeType,
                  },
                  source_audio: {
                    data: voice.replicated.sourceAudio.data,
                    mime_type: voice.replicated.sourceAudio.mimeType,
                  },
                },
              }),
        },
      },
      successfulResponseHandler: createJsonResponseHandler(
        lazySchema(() => zodSchema(voiceResponseSchema)),
      ),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    return convertVoice(value);
  }

  async list(options: GoogleListVoicesOptions = {}): Promise<{
    voices: GoogleVoice[];
    nextPageToken?: string | null;
  }> {
    const { pageSize, pageToken, languageCode, regionCode, ...filters } =
      await validateTypes({ value: options, schema: listVoicesSchema });
    const url = new URL(`${this.config.baseURL}/voices`);
    const query = {
      page_size: pageSize,
      page_token: pageToken,
      language_code: languageCode,
      region_code: regionCode,
      ...filters,
    };
    for (const [name, value] of Object.entries(query)) {
      if (value != null) {
        for (const item of Array.isArray(value) ? value : [value]) {
          url.searchParams.append(name, String(item));
        }
      }
    }
    const { value } = await getFromApi({
      url: url.toString(),
      validateUrl: false,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        lazySchema(() =>
          zodSchema(
            z.object({
              voices: z.array(voiceResponseSchema).nullish(),
              next_page_token: z.string().nullish(),
            }),
          ),
        ),
      ),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    return {
      voices: value.voices?.map(convertVoice) ?? [],
      nextPageToken: value.next_page_token,
    };
  }

  async get(
    options: GoogleVoicesRequestOptions & { id: string },
  ): Promise<GoogleVoice> {
    const { value } = await getFromApi({
      url: `${this.config.baseURL}/voices/${await this.encodeId(options.id)}`,
      validateUrl: false,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        lazySchema(() => zodSchema(voiceResponseSchema)),
      ),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    return convertVoice(value);
  }

  async delete(
    options: GoogleVoicesRequestOptions & { id: string },
  ): Promise<void> {
    await deleteFromApi({
      url: `${this.config.baseURL}/voices/${await this.encodeId(options.id)}`,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: async () => ({ value: undefined }),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
  }

  private async encodeId(id: string): Promise<string> {
    // Dot segments are normalized even when percent-encoded by the URL parser.
    await validateTypes({
      value: id,
      schema: z
        .string()
        .min(1)
        .refine(value => value !== '.' && value !== '..'),
    });
    return encodeURIComponent(id);
  }
}
