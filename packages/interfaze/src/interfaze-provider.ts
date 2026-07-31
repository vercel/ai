import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { InterfazeChatLanguageModel } from './interfaze-chat-language-model';
import type { InterfazeChatModelId } from './interfaze-chat-language-model-options';
import { createInterfazeMetadataExtractor } from './interfaze-metadata-extractor';
import { resolveInterfazeVideoFileParts } from './interfaze-video-parts';
import { INTERFAZE_BASE_URL } from './side-channels';
import { VERSION } from './version';

const interfazeErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
  param: z.any().nullish(),
  code: z.union([z.string(), z.number()]).nullish(),
});

export type InterfazeErrorData = z.infer<typeof interfazeErrorSchema>;

const interfazeErrorStructure: ProviderErrorStructure<InterfazeErrorData> = {
  errorSchema: interfazeErrorSchema,
  errorToMessage: data => data.message,
};

/** Serialize guardrail categories into a `<guard>…</guard>` system message. */
function injectGuardTag(
  args: Record<string, any>,
  guard: readonly string[],
): Record<string, any> {
  if (!Array.isArray(guard) || guard.length === 0) return args;
  const tag = `<guard>${guard.join(', ')}</guard>`;
  const messages = Array.isArray(args.messages) ? [...args.messages] : [];
  const idx = messages.findIndex((m: any) => m?.role === 'system');
  if (idx !== -1 && typeof messages[idx]?.content === 'string') {
    const existing = messages[idx].content as string;
    messages[idx] = {
      ...messages[idx],
      content: existing ? `${tag}\n${existing}` : tag,
    };
  } else {
    messages.unshift({ role: 'system', content: tag });
  }
  return { ...args, messages };
}

function transformInterfazeRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  let out = resolveInterfazeVideoFileParts(args);

  // `precontext` may arrive as a single object; the API expects an array.
  if (out.precontext !== undefined && !Array.isArray(out.precontext)) {
    out = { ...out, precontext: [out.precontext] };
  }

  // Map the camelCase provider option to the wire field.
  if (out.reasoningEffort !== undefined) {
    const { reasoningEffort, ...rest } = out;
    out = { ...rest, reasoning_effort: reasoningEffort };
  }

  // `guard` is serialized into a `<guard>…</guard>` system message.
  if (out.guard !== undefined) {
    const { guard, ...rest } = out;
    out = injectGuardTag(rest, guard);
  }

  return out;
}

export interface InterfazeProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
  /** Stream `<precontext>` deltas as they're produced (`x-show-additional-info`). */
  showAdditionalInfo?: boolean;
  /** Skip the mixture-of-experts router (`x-bypass-moe`). */
  bypassMoe?: boolean;
  /** Skip the semantic cache (`x-bypass-cache`). */
  bypassCache?: boolean;
  /** Admin key that surfaces a `debug` field on responses (`x-admin-key`). */
  adminKey?: string;
}

export interface InterfazeProvider extends ProviderV4 {
  (modelId: InterfazeChatModelId): LanguageModelV4;
  languageModel(modelId: InterfazeChatModelId): LanguageModelV4;
  chat(modelId: InterfazeChatModelId): LanguageModelV4;
  textEmbeddingModel(modelId: string): never;
}

export function createInterfaze(
  options: InterfazeProviderSettings = {},
): InterfazeProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? INTERFAZE_BASE_URL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'INTERFAZE_API_KEY',
          description: 'Interfaze API key',
        })}`,
        ...(options.showAdditionalInfo
          ? { 'x-show-additional-info': 'true' }
          : {}),
        ...(options.bypassMoe ? { 'x-bypass-moe': 'true' } : {}),
        ...(options.bypassCache ? { 'x-bypass-cache': 'true' } : {}),
        ...(options.adminKey ? { 'x-admin-key': options.adminKey } : {}),
        ...options.headers,
      },
      `ai-sdk/interfaze/${VERSION}`,
    );

  const createLanguageModel = (modelId: InterfazeChatModelId) => {
    return new InterfazeChatLanguageModel(modelId, {
      provider: `interfaze.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: interfazeErrorStructure,
      supportsStructuredOutputs: true,
      transformRequestBody: transformInterfazeRequestBody,
      metadataExtractor: createInterfazeMetadataExtractor(),
      // Interfaze fetches video URLs server-side,
      // so pass URLs through instead of downloading them.
      supportedUrls: () => ({ 'video/*': [/^https:\/\/.+$/] }),
    });
  };

  const provider = (modelId: InterfazeChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const interfaze = createInterfaze();
