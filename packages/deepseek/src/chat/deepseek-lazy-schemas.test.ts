import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';

vi.mock('zod/v4', async importOriginal => {
  const actual = await importOriginal<{ z: typeof z }>();
  return {
    ...actual,
    z: {
      ...actual.z,
      object: vi.fn(actual.z.object),
      looseObject: vi.fn(actual.z.looseObject),
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('DeepSeek lazy schemas', () => {
  it('defers response dependencies and reuses them across responses and chunks', async () => {
    const {
      deepseekChatResponseSchema,
      deepseekChatChunkSchema,
      deepSeekErrorSchema,
    } = await import('./deepseek-chat-api-types');
    expect(z.object).not.toHaveBeenCalled();
    expect(z.looseObject).not.toHaveBeenCalled();

    const response = asSchema(deepseekChatResponseSchema);
    const objects = vi.mocked(z.object).mock.calls.length;
    expect(objects).toBeGreaterThan(0);
    expect(z.looseObject).toHaveBeenCalledTimes(3);
    expect(asSchema(deepseekChatResponseSchema)).toBe(response);
    expect(z.object).toHaveBeenCalledTimes(objects);

    const chunk = asSchema(deepseekChatChunkSchema);
    expect(z.looseObject).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(z.object)
        .mock.calls.filter(
          ([shape]) => shape != null && 'top_logprobs' in shape,
        ),
    ).toHaveLength(1);
    const chunkObjects = vi.mocked(z.object).mock.calls.length;
    const error = asSchema(deepSeekErrorSchema);
    expect(z.object).toHaveBeenCalledTimes(chunkObjects);
    expect(asSchema(deepseekChatChunkSchema)).toBe(chunk);
    expect(asSchema(deepSeekErrorSchema)).toBe(error);
  });

  it('can initialize the shared error schema before the stream schema', async () => {
    const { deepSeekErrorSchema, deepseekChatChunkSchema } =
      await import('./deepseek-chat-api-types');
    const error = asSchema(deepSeekErrorSchema);
    expect(z.looseObject).not.toHaveBeenCalled();
    asSchema(deepseekChatChunkSchema);
    const objects = vi.mocked(z.object).mock.calls.length;
    expect(asSchema(deepSeekErrorSchema)).toBe(error);
    expect(z.object).toHaveBeenCalledTimes(objects);
    expect(
      await safeValidateTypes({
        value: { error: { message: 1 } },
        schema: deepseekChatChunkSchema,
      }),
    ).toMatchObject({ success: false });
  });

  it('defers and caches composed chat and message options', async () => {
    const {
      deepseekLanguageModelChatOptions,
      deepseekMessageProviderOptions,
      deepseekAssistantMessageProviderOptions,
    } = await import('./deepseek-chat-language-model-options');
    expect(z.object).not.toHaveBeenCalled();
    expect(asSchema(deepseekLanguageModelChatOptions)).toBe(
      asSchema(deepseekLanguageModelChatOptions),
    );
    expect(asSchema(deepseekMessageProviderOptions)).toBe(
      asSchema(deepseekMessageProviderOptions),
    );
    expect(asSchema(deepseekAssistantMessageProviderOptions)).toBe(
      asSchema(deepseekAssistantMessageProviderOptions),
    );
  });

  it('defers and caches file part options', async () => {
    const { deepseekFilePartProviderOptions } =
      await import('./deepseek-file-part-options');
    expect(z.object).not.toHaveBeenCalled();
    const schema = asSchema(deepseekFilePartProviderOptions);
    expect(asSchema(deepseekFilePartProviderOptions)).toBe(schema);
    expect(z.object).toHaveBeenCalledTimes(1);
  });
});
