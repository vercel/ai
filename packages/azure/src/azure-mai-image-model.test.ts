import type { ImageModelV4CallOptions } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type * as ProviderUtils from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dimensionsForAspectRatio } from './azure-mai-image-model';
import {
  createAzure,
  type AzureOpenAIProviderSettings,
} from './azure-openai-provider';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

const { downloadBlobMock } = vi.hoisted(() => ({ downloadBlobMock: vi.fn() }));
vi.mock('@ai-sdk/provider-utils', async importOriginal => ({
  ...(await importOriginal<typeof ProviderUtils>()),
  downloadBlob: downloadBlobMock,
}));

const maiResponse = {
  created: 1791229019,
  model: 'MAI-Image-2.6-Flash',
  size: '768x768',
  usage: {
    num_output_tokens: 576,
    num_input_text_tokens: 10,
    num_input_image_tokens: 0,
  },
  data: [{ b64_json: 'iVBORw0KGgo=' }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(
  settings: AzureOpenAIProviderSettings = {},
  response: () => Response = () => jsonResponse(maiResponse),
) {
  const fetch = vi.fn<FetchFunction>(async () => response());
  const provider = createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-key',
    ...settings,
    fetch,
  });
  const request = () => {
    const [url, init] = fetch.mock.calls.at(-1)!;
    return {
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body,
      json: () => JSON.parse(init?.body as string),
    };
  };
  return { provider, fetch, request };
}

function callOptions(
  overrides: Partial<ImageModelV4CallOptions> = {},
): ImageModelV4CallOptions {
  return {
    prompt: 'A red apple',
    n: 1,
    size: undefined,
    aspectRatio: undefined,
    seed: undefined,
    files: undefined,
    mask: undefined,
    providerOptions: {},
    ...overrides,
  };
}

const generationsUrl =
  'https://test-resource.services.ai.azure.com/mai/v1/images/generations';
const editsUrl =
  'https://test-resource.services.ai.azure.com/mai/v1/images/edits';

afterEach(() => {
  vi.restoreAllMocks();
  downloadBlobMock.mockReset();
});

describe('API routing', () => {
  it.each([
    ['MAI-Image-2.6', undefined, 'mai'],
    ['mai-image-2.6-flash', undefined, 'mai'],
    ['MAI-Image-2.5-Pro', undefined, 'mai'],
    ['gpt-image-1', undefined, 'openai'],
    ['mai-image-custom', undefined, 'openai'],
    ['MAI-Image-2.6', 'openai', 'openai'],
    ['my-mai-deployment', 'mai', 'mai'],
  ] as const)('routes %s with api=%s to %s', async (id, api, expected) => {
    const { provider, request } = setup({}, () =>
      jsonResponse(
        expected === 'mai' ? maiResponse : { data: [{ b64_json: 'aGk=' }] },
      ),
    );

    await provider.image(id).doGenerate(
      callOptions({
        providerOptions: api ? { azure: { api } } : {},
      }),
    );

    expect(request().url).toBe(
      expected === 'mai'
        ? generationsUrl
        : 'https://test-resource.openai.azure.com/openai/v1/images/generations?api-version=v1',
    );
  });

  it('advertises MAI capabilities by model ID', () => {
    const { provider } = setup();
    const mai = provider.imageModel('MAI-Image-2.6');
    expect(mai.maxImagesPerCall).toBe(1);
    expect(mai.supportsFileInputs).toBe(true);
    expect(mai.supportsMaskInputs).toBe(false);

    const openai = provider.imageModel('my-dalle-deployment');
    expect(openai.supportsFileInputs).toBeUndefined();
    expect(openai.supportsMaskInputs).toBeUndefined();
  });

  it('warns about MAI-only options on the OpenAI API', async () => {
    const { provider } = setup({}, () =>
      jsonResponse({ data: [{ b64_json: 'aGk=' }] }),
    );

    const result = await provider.image('gpt-image-1').doGenerate(
      callOptions({
        providerOptions: { azure: { webGrounding: true } },
      }),
    );

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'providerOptions.azure.webGrounding',
      details: 'This option requires the MAI image API.',
    });
  });

  it.each(['MAI-Image-2.6', 'gpt-image-1'])(
    'accepts unrelated azure provider options for %s',
    async id => {
      const { provider } = setup({}, () =>
        jsonResponse(
          id.startsWith('MAI') ? maiResponse : { data: [{ b64_json: 'aGk=' }] },
        ),
      );

      const result = await provider.image(id).doGenerate(
        callOptions({
          providerOptions: { azure: { someFutureOption: 'value' } },
        }),
      );

      expect(result.images).toHaveLength(1);
    },
  );

  it('round-trips through workflow serialization', () => {
    const { provider } = setup();
    const model = provider.image('MAI-Image-2.6');
    const ModelClass = model.constructor as any;
    const restored = ModelClass[WORKFLOW_DESERIALIZE](
      ModelClass[WORKFLOW_SERIALIZE](model),
    );
    expect(restored.modelId).toBe('MAI-Image-2.6');
    expect(restored.maxImagesPerCall).toBe(1);
  });
});

describe('generations', () => {
  it('sends width, height, and MAI options', async () => {
    const { provider, request } = setup();

    await provider.image('MAI-Image-2.6-Flash').doGenerate(
      callOptions({
        size: '1536x1024',
        providerOptions: {
          azure: { autoAspectRatio: true, webGrounding: false },
        },
      }),
    );

    const { url, headers, json } = request();
    expect(url).toBe(generationsUrl);
    expect(headers.get('api-key')).toBe('test-key');
    expect(headers.get('user-agent')).toContain('0.0.0-test');
    expect(json()).toEqual({
      model: 'MAI-Image-2.6-Flash',
      prompt: 'A red apple',
      width: 1536,
      height: 1024,
      auto_aspect_ratio: true,
      web_grounding: false,
    });
  });

  it('omits dimensions when neither size nor aspect ratio is set', async () => {
    const { provider, request } = setup();

    await provider.image('MAI-Image-2.6').doGenerate(callOptions());

    expect(request().json()).toEqual({
      model: 'MAI-Image-2.6',
      prompt: 'A red apple',
    });
  });

  it('maps aspect ratio to dimensions', async () => {
    const { provider, request } = setup();

    await provider
      .image('MAI-Image-2.6')
      .doGenerate(callOptions({ aspectRatio: '16:9' }));

    expect(request().json()).toMatchObject({ width: 1360, height: 768 });
  });

  it('prefers size over aspect ratio', async () => {
    const { provider, request } = setup();

    const result = await provider
      .image('MAI-Image-2.6')
      .doGenerate(callOptions({ size: '1024x1024', aspectRatio: '16:9' }));

    expect(request().json()).toMatchObject({ width: 1024, height: 1024 });
    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'aspectRatio',
      details: 'aspectRatio is ignored when size is set.',
    });
  });

  it('warns about unsupported call options', async () => {
    const { provider } = setup();

    const result = await provider
      .image('MAI-Image-2.6')
      .doGenerate(callOptions({ seed: 42 }));

    expect(result.warnings).toEqual([{ type: 'unsupported', feature: 'seed' }]);
  });

  it('sends one request per image when called with n > 1', async () => {
    const { provider, fetch } = setup();

    const result = await provider
      .image('MAI-Image-2.6')
      .doGenerate(callOptions({ n: 2 }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.images).toEqual(['iVBORw0KGgo=', 'iVBORw0KGgo=']);
    expect(result.usage).toEqual({
      inputTokens: 20,
      outputTokens: 1152,
      totalTokens: 1172,
    });
    expect(result.providerMetadata?.azure?.images).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('returns images, usage, and provider metadata', async () => {
    const { provider } = setup();

    const result = await provider
      .image('MAI-Image-2.6-Flash')
      .doGenerate(callOptions());

    expect(result.images).toEqual(['iVBORw0KGgo=']);
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 576,
      totalTokens: 586,
    });
    expect(result.providerMetadata).toEqual({
      azure: {
        images: [
          {
            created: 1791229019,
            size: '768x768',
            textTokens: 10,
            imageTokens: 0,
          },
        ],
      },
    });
    expect(result.response.modelId).toBe('MAI-Image-2.6-Flash');
  });

  it('tolerates responses without usage', async () => {
    const { provider } = setup({}, () =>
      jsonResponse({ data: [{ b64_json: 'aGk=' }] }),
    );

    const result = await provider
      .image('MAI-Image-2.6')
      .doGenerate(callOptions());

    expect(result.usage).toBeUndefined();
    expect(result.providerMetadata).toEqual({ azure: { images: [{}] } });
  });

  it('surfaces API error messages', async () => {
    const { provider } = setup({}, () =>
      jsonResponse(
        {
          error: {
            code: 'unsupported_request_value',
            message:
              "Model does not support request parameter value supplied: 'width' must be at least 768 pixels.",
          },
        },
        400,
      ),
    );

    await expect(
      provider
        .image('MAI-Image-2.6')
        .doGenerate(callOptions({ size: '512x512' })),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Model does not support request parameter value supplied: 'width' must be at least 768 pixels.",
    });
  });

  it.each([
    ['an HTML', '<html><body>Bad Gateway</body></html>', 'text/html', 502],
    ['an empty', '', 'text/plain', 500],
  ])(
    'keeps the status and raw body for %s error body',
    async (_, body, contentType, status) => {
      const { provider } = setup(
        {},
        () =>
          new Response(body, {
            status,
            headers: { 'content-type': contentType },
          }),
      );

      await expect(
        provider.image('MAI-Image-2.6').doGenerate(callOptions()),
      ).rejects.toMatchObject({ statusCode: status, responseBody: body });
    },
  );

  it('uses maiBaseURL when set', async () => {
    const { provider, request } = setup({
      maiBaseURL: 'https://proxy.example.com/mai/v1/',
    });

    await provider.image('MAI-Image-2.6').doGenerate(callOptions());

    expect(request().url).toBe(
      'https://proxy.example.com/mai/v1/images/generations',
    );
  });

  it('authenticates with an Entra ID token provider', async () => {
    const { provider, request } = setup({
      apiKey: undefined,
      tokenProvider: async () => 'entra-token',
    });

    await provider.image('MAI-Image-2.6').doGenerate(callOptions());

    const { headers } = request();
    expect(headers.get('authorization')).toBe('Bearer entra-token');
    expect(headers.get('api-key')).toBeNull();
  });
});

describe('edits', () => {
  it('sends reference images as repeated multipart fields', async () => {
    const { provider, request } = setup();

    const result = await provider.image('MAI-Image-2.6').doGenerate(
      callOptions({
        prompt: 'Combine both apples',
        size: '1024x1024',
        files: [
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
          { type: 'file', data: 'AQID', mediaType: 'image/jpeg' },
        ],
        mask: {
          type: 'file',
          data: new Uint8Array([4]),
          mediaType: 'image/png',
        },
        providerOptions: { azure: { webGrounding: true } },
      }),
    );

    const { url, body } = request();
    expect(url).toBe(editsUrl);
    const formData = body as FormData;
    expect(formData.get('model')).toBe('MAI-Image-2.6');
    expect(formData.get('prompt')).toBe('Combine both apples');
    expect(formData.get('width')).toBe('1024');
    expect(formData.get('height')).toBe('1024');
    expect(formData.get('web_grounding')).toBe('true');
    expect(formData.has('mask')).toBe(false);
    const images = formData.getAll('image') as File[];
    expect(images.map(image => [image.name, image.type])).toEqual([
      ['image-1.png', 'image/png'],
      ['image-2.jpg', 'image/jpeg'],
    ]);
    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'mask',
      details: 'MAI image edits do not support masks.',
    });
  });

  it('sums text and image input tokens for edits', async () => {
    const { provider } = setup({}, () =>
      jsonResponse({
        ...maiResponse,
        size: '1024x1024',
        usage: {
          num_output_tokens: 1024,
          num_input_text_tokens: 252,
          num_input_image_tokens: 1600,
        },
      }),
    );

    const result = await provider.image('MAI-Image-2.6-Flash').doGenerate(
      callOptions({
        files: [
          { type: 'file', data: new Uint8Array([1]), mediaType: 'image/png' },
          { type: 'file', data: new Uint8Array([2]), mediaType: 'image/png' },
        ],
      }),
    );

    expect(result.usage).toEqual({
      inputTokens: 1852,
      outputTokens: 1024,
      totalTokens: 2876,
    });
    expect(result.providerMetadata).toEqual({
      azure: {
        images: [
          {
            created: 1791229019,
            size: '1024x1024',
            textTokens: 252,
            imageTokens: 1600,
          },
        ],
      },
    });
  });

  it('downloads URL reference images with the abort signal', async () => {
    downloadBlobMock.mockResolvedValue(
      new Blob([new Uint8Array([1])], { type: 'image/png' }),
    );
    const { provider, request } = setup();
    const abortSignal = new AbortController().signal;

    await provider.image('MAI-Image-2.6').doGenerate(
      callOptions({
        files: [{ type: 'url', url: 'https://example.com/apple.png' }],
        abortSignal,
      }),
    );

    expect(downloadBlobMock).toHaveBeenCalledWith(
      'https://example.com/apple.png',
      { abortSignal },
    );
    expect((request().body as FormData).getAll('image')).toHaveLength(1);
  });

  it('stops before the MAI request when a download is aborted', async () => {
    const controller = new AbortController();
    downloadBlobMock.mockImplementation(
      (_url: string, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () =>
            reject(options.abortSignal?.reason),
          );
        }),
    );
    const { provider, fetch } = setup();

    const result = provider.image('MAI-Image-2.6').doGenerate(
      callOptions({
        files: [{ type: 'url', url: 'https://example.com/apple.png' }],
        abortSignal: controller.signal,
      }),
    );
    await vi.waitFor(() => expect(downloadBlobMock).toHaveBeenCalled());
    controller.abort(new Error('aborted'));

    await expect(result).rejects.toThrow('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('dimensionsForAspectRatio', () => {
  it.each([
    ['1:1', { width: 1024, height: 1024 }],
    ['16:9', { width: 1360, height: 768 }],
    ['9:16', { width: 768, height: 1360 }],
    ['4:3', { width: 1168, height: 880 }],
    ['21:9', { width: 1792, height: 768 }],
    ['0:1', undefined],
    ['wide', undefined],
  ])('maps %s', (aspectRatio, expected) => {
    expect(dimensionsForAspectRatio(aspectRatio)).toEqual(expected);
  });
});
