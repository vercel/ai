import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createReplicate } from './replicate-provider';
import { ReplicateImageModel } from './replicate-image-model';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = 'The Loch Ness monster getting a manicure';

const provider = createReplicate({ apiToken: 'test-api-token' });
const model = provider.image('black-forest-labs/flux-schnell');

describe('capabilities', () => {
  it.each([
    {
      modelId: 'black-forest-labs/flux-fill-pro',
      supportsFileInputs: true,
      supportsMaskInputs: true,
    },
    {
      modelId: 'black-forest-labs/flux-2-pro',
      supportsFileInputs: true,
      supportsMaskInputs: false,
    },
    {
      modelId: 'custom/image-model',
      supportsFileInputs: undefined,
      supportsMaskInputs: undefined,
    },
    {
      modelId: 'black-forest-labs/flux-2-custom',
      supportsFileInputs: undefined,
      supportsMaskInputs: undefined,
    },
    {
      modelId: 'black-forest-labs/flux-2-dev',
      supportsFileInputs: true,
      supportsMaskInputs: false,
    },
  ] as const)(
    'advertises file=$supportsFileInputs and mask=$supportsMaskInputs for $modelId',
    ({ modelId, supportsFileInputs, supportsMaskInputs }) => {
      const capabilityModel = new ReplicateImageModel(modelId, {
        provider: 'replicate.image',
        baseURL: 'https://api.example.com',
      });

      expect(capabilityModel.supportsFileInputs).toBe(supportsFileInputs);
      expect(capabilityModel.supportsMaskInputs).toBe(supportsMaskInputs);
    },
  );
});

describe('doGenerate', () => {
  const testDate = new Date(2024, 0, 1);
  const server = createTestServer({
    'https://api.replicate.com/*': {},
    'https://example.com/*': {},
    'https://replicate.delivery/*': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  function prepareResponse({
    output = ['https://replicate.delivery/xezq/abc/out-0.webp'],
  }: { output?: string | Array<string> | null } = {}) {
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      body: {
        id: 's7x1e3dcmhrmc0cm8rbatcneec',
        model: 'black-forest-labs/flux-schnell',
        version: 'dp-4d0bcc010b3049749a251855f12800be',
        input: {
          num_outputs: 1,
          prompt: 'The Loch Ness Monster getting a manicure',
        },
        logs: '',
        output,
        data_removed: false,
        error: null,
        status: 'processing',
        created_at: '2025-01-08T13:24:38.692Z',
        urls: {
          get: 'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec',
          stream:
            'https://stream.replicate.com/v1/files/bcwr-3okdfv3o2wehstv5f2okyftwxy57hhypqsi6osiim5iaq5k7u24a',
        },
      },
    };
  }

  it('should pass the model and the settings', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x768',
      aspectRatio: '3:4',
      seed: 123,
      providerOptions: {
        replicate: {
          style: 'realistic_image',
        },
        other: {
          something: 'else',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '3:4',
        size: '1024x768',
        seed: 123,
        style: 'realistic_image',
      },
    });
  });

  it('should call the correct url', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestMethod).toStrictEqual('POST');
    expect(server.calls[0].requestUrl).toStrictEqual(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    );
  });

  it('should pass headers and set the prefer header', async () => {
    prepareResponse();

    const provider = createReplicate({
      apiToken: 'test-api-token',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('black-forest-labs/flux-schnell').doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-token',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      prefer: 'wait',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk-replicate/0.0.0-test`,
    );
  });

  it('should set custom wait time in prefer header when maxWaitTimeInSeconds is specified', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        replicate: {
          maxWaitTimeInSeconds: 120,
        },
      },
    });

    expect(server.calls[0].requestHeaders.prefer).toBe('wait=120');
  });

  it('should not include maxWaitTimeInSeconds in request body', async () => {
    prepareResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        replicate: {
          maxWaitTimeInSeconds: 120,
          pollIntervalMillis: 10,
          maxPollAttempts: 100,
          guidance_scale: 7.5,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.input.maxWaitTimeInSeconds).toBeUndefined();
    expect(requestBody.input.pollIntervalMillis).toBeUndefined();
    expect(requestBody.input.maxPollAttempts).toBeUndefined();
    expect(requestBody.input.guidance_scale).toBe(7.5);
  });

  it('should extract the generated image from array response', async () => {
    prepareResponse({
      output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
    });

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual([
      new Uint8Array(Buffer.from('test-binary-content')),
    ]);

    expect(server.calls[1].requestMethod).toStrictEqual('GET');
    expect(server.calls[1].requestUrl).toStrictEqual(
      'https://replicate.delivery/xezq/abc/out-0.webp',
    );
  });

  it('should extract the generated image from string response', async () => {
    prepareResponse({
      output: 'https://replicate.delivery/xezq/abc/out-0.webp',
    });

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual([
      new Uint8Array(Buffer.from('test-binary-content')),
    ]);

    expect(server.calls[1].requestMethod).toStrictEqual('GET');
    expect(server.calls[1].requestUrl).toStrictEqual(
      'https://replicate.delivery/xezq/abc/out-0.webp',
    );
  });

  it('should poll until output is available when the sync wait expires', async () => {
    server.urls['https://api.replicate.com/*'].response = ({ callNumber }) => ({
      type: 'json-value',
      body: {
        id: 'pending-prediction',
        status:
          callNumber === 0
            ? 'starting'
            : callNumber === 1
              ? 'processing'
              : 'succeeded',
        output:
          callNumber < 2
            ? null
            : ['https://replicate.delivery/xezq/abc/out-0.webp'],
        error: null,
        urls: {
          get: 'https://api.replicate.com/v1/predictions/pending-prediction',
        },
      },
    });

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        replicate: {
          pollIntervalMillis: 1,
          maxPollAttempts: 100,
        },
      },
    });

    expect(result.images).toStrictEqual([
      new Uint8Array(Buffer.from('test-binary-content')),
    ]);
    expect(server.calls.map(call => call.requestMethod)).toStrictEqual([
      'POST',
      'GET',
      'GET',
      'GET',
    ]);
    expect(server.calls[1].requestUrl).toBe(
      'https://api.replicate.com/v1/predictions/pending-prediction',
    );
    expect(server.calls[1].requestHeaders.authorization).toBe(
      'Bearer test-api-token',
    );
  });

  interface RecordedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
  }

  function recordRequest(
    requests: Array<RecordedRequest>,
    url: RequestInfo | URL,
    init: RequestInit | undefined,
  ): RecordedRequest {
    const recorded = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    requests.push(recorded);
    return recorded;
  }

  function headerNames(headers: Record<string, string>): Array<string> {
    return Object.keys(headers).map(name => name.toLowerCase());
  }

  function headerValue(
    headers: Record<string, string>,
    name: string,
  ): string | undefined {
    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1];
  }

  it('should cancel the prediction and rethrow the abort error when the caller aborts while polling', async () => {
    const controller = new AbortController();
    const requests: Array<RecordedRequest> = [];

    const prediction = {
      id: 'aborted-prediction',
      status: 'processing',
      output: null,
      error: null,
      urls: {
        get: 'https://api.replicate.com/v1/predictions/aborted-prediction',
      },
    };

    let statusRequests = 0;

    const abortingModel = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com/v1',
        headers: { Authorization: 'Bearer test-api-token' },
        fetch: async (url, init) => {
          recordRequest(requests, url, init);

          if (init?.method === 'POST') {
            return Response.json(prediction);
          }

          statusRequests++;
          if (statusRequests === 2) {
            // abort while the call is polling
            controller.abort();
          }

          return Response.json(prediction);
        },
      },
    );

    const error = await abortingModel
      .doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        headers: {
          'idempotency-key': 'create-key',
          'x-per-call-header': 'per-call-value',
        },
        providerOptions: {
          replicate: {
            pollIntervalMillis: 1,
            maxPollAttempts: 10,
          },
        },
        abortSignal: controller.signal,
      })
      .catch(caught => caught);

    // the original abort error is rethrown unchanged
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('Delay was aborted');

    await vi.waitFor(() => {
      expect(
        requests.filter(request => request.url.endsWith('/cancel')),
      ).toHaveLength(1);
    });

    const cancelRequest = requests.find(request =>
      request.url.endsWith('/cancel'),
    );

    expect(cancelRequest?.url).toBe(
      'https://api.replicate.com/v1/predictions/aborted-prediction/cancel',
    );
    expect(cancelRequest?.method).toBe('POST');
    expect(headerValue(cancelRequest!.headers, 'authorization')).toBe(
      'Bearer test-api-token',
    );
    // the create call's per-call headers and idempotency key are not repeated
    expect(headerNames(cancelRequest!.headers)).not.toContain(
      'idempotency-key',
    );
    expect(headerNames(cancelRequest!.headers)).not.toContain(
      'x-per-call-header',
    );
  });

  it('should cancel the prediction and rethrow the timeout error when the maximum polling attempts are reached', async () => {
    const requests: Array<RecordedRequest> = [];

    const prediction = {
      id: 'timed-out-prediction',
      status: 'processing',
      output: null,
      error: null,
      urls: {
        get: 'https://api.replicate.com/v1/predictions/timed-out-prediction',
      },
    };

    const timingOutModel = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com/v1',
        headers: { Authorization: 'Bearer test-api-token' },
        fetch: async (url, init) => {
          recordRequest(requests, url, init);
          return Response.json(prediction);
        },
      },
    );

    const error = await timingOutModel
      .doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        headers: { 'idempotency-key': 'create-key' },
        providerOptions: {
          replicate: {
            pollIntervalMillis: 1,
            maxPollAttempts: 2,
          },
        },
      })
      .catch(caught => caught);

    // the original timeout error is rethrown unchanged
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('Error');
    expect(error.message).toBe(
      'Replicate image generation did not complete after 2 polling attempts.',
    );

    await vi.waitFor(() => {
      expect(
        requests.filter(request => request.url.endsWith('/cancel')),
      ).toHaveLength(1);
    });

    const cancelRequest = requests.find(request =>
      request.url.endsWith('/cancel'),
    );

    expect(cancelRequest?.url).toBe(
      'https://api.replicate.com/v1/predictions/timed-out-prediction/cancel',
    );
    expect(cancelRequest?.method).toBe('POST');
    expect(headerValue(cancelRequest!.headers, 'authorization')).toBe(
      'Bearer test-api-token',
    );
    expect(headerNames(cancelRequest!.headers)).not.toContain(
      'idempotency-key',
    );
  });

  it('should not send a cancel request when the prediction completes', async () => {
    const requests: Array<RecordedRequest> = [];

    const completedPrediction = {
      id: 'completed-prediction',
      status: 'succeeded',
      output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
      error: null,
      urls: {
        get: 'https://api.replicate.com/v1/predictions/completed-prediction',
      },
    };

    const completingModel = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com/v1',
        headers: { Authorization: 'Bearer test-api-token' },
        fetch: async (url, init) => {
          recordRequest(requests, url, init);

          if (String(url).includes('replicate.delivery')) {
            return new Response(Buffer.from('test-binary-content'));
          }

          return Response.json(completedPrediction);
        },
      },
    );

    await completingModel.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        replicate: {
          maxPollAttempts: 10,
        },
      },
    });

    // give a stray fire-and-forget cancel the chance to show up
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(
      requests.filter(request => request.url.endsWith('/cancel')),
    ).toHaveLength(0);
  });

  it('should not send credentials to a polling URL on a different origin', async () => {
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      body: {
        id: 'pending-prediction',
        status: 'starting',
        output: null,
        error: null,
        urls: {
          get: 'https://example.com/predictions/pending-prediction',
        },
      },
    };
    server.urls['https://example.com/*'].response = {
      type: 'json-value',
      body: {
        id: 'pending-prediction',
        status: 'succeeded',
        output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
        error: null,
        urls: {
          get: 'https://example.com/predictions/pending-prediction',
        },
      },
    };

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        replicate: {
          pollIntervalMillis: 1,
          maxPollAttempts: 100,
        },
      },
    });

    expect(server.calls[1].requestUrl).toBe(
      'https://example.com/predictions/pending-prediction',
    );
    expect(server.calls[1].requestHeaders.authorization).toBeUndefined();
  });

  it.each(['failed', 'canceled'] as const)(
    'should throw when polling returns %s',
    async status => {
      server.urls['https://api.replicate.com/*'].response = ({
        callNumber,
      }) => ({
        type: 'json-value',
        body: {
          id: 'pending-prediction',
          status: callNumber === 0 ? 'starting' : status,
          output: null,
          error: callNumber === 0 ? null : 'Prediction did not complete',
          urls: {
            get: 'https://api.replicate.com/v1/predictions/pending-prediction',
          },
        },
      });

      await expect(
        model.doGenerate({
          prompt,
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {
            replicate: {
              pollIntervalMillis: 1,
              maxPollAttempts: 100,
            },
          },
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidResponseDataError',
        message: `Replicate image generation ${status}: Prediction did not complete`,
      });
    },
  );

  it('should throw when a succeeded prediction has no output', async () => {
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      body: {
        id: 'completed-prediction',
        status: 'succeeded',
        output: null,
        error: null,
        urls: {
          get: 'https://api.replicate.com/v1/predictions/completed-prediction',
        },
      },
    };

    await expect(
      model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidResponseDataError',
      message: 'Replicate image generation completed without output.',
    });
    expect(server.calls).toHaveLength(1);
  });

  it('should stop when the maximum polling attempts are reached', async () => {
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      body: {
        id: 'pending-prediction',
        status: 'processing',
        output: null,
        error: null,
        urls: {
          get: 'https://api.replicate.com/v1/predictions/pending-prediction',
        },
      },
    };

    await expect(
      model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          replicate: {
            pollIntervalMillis: 1,
            maxPollAttempts: 2,
          },
        },
      }),
    ).rejects.toThrow(
      'Replicate image generation did not complete after 2 polling attempts.',
    );

    await vi.waitFor(() => {
      expect(server.calls).toHaveLength(4);
    });
    expect(server.calls[3].requestMethod).toBe('POST');
    expect(server.calls[3].requestUrl).toBe(
      'https://api.replicate.com/v1/predictions/pending-prediction/cancel',
    );
  });

  it('should return response metadata', async () => {
    const modelWithTimestamp = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com',
        _internal: { currentDate: () => testDate },
      },
    );
    prepareResponse({
      output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
    });

    const result = await modelWithTimestamp.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'black-forest-labs/flux-schnell',
      headers: expect.any(Object),
    });
  });

  it('should include response headers in metadata', async () => {
    const modelWithTimestamp = new ReplicateImageModel(
      'black-forest-labs/flux-schnell',
      {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com',
        _internal: {
          currentDate: () => testDate,
        },
      },
    );
    server.urls['https://api.replicate.com/*'].response = {
      type: 'json-value',
      headers: {
        'custom-response-header': 'response-header-value',
      },
      body: {
        id: 's7x1e3dcmhrmc0cm8rbatcneec',
        model: 'black-forest-labs/flux-schnell',
        version: 'dp-4d0bcc010b3049749a251855f12800be',
        input: {
          num_outputs: 1,
          prompt: 'The Loch Ness Monster getting a manicure',
        },
        logs: '',
        output: ['https://replicate.delivery/xezq/abc/out-0.webp'],
        data_removed: false,
        error: null,
        status: 'processing',
        created_at: '2025-01-08T13:24:38.692Z',
        urls: {
          get: 'https://api.replicate.com/v1/predictions/s7x1e3dcmhrmc0cm8rbatcneec',
          stream:
            'https://stream.replicate.com/v1/files/bcwr-3okdfv3o2wehstv5f2okyftwxy57hhypqsi6osiim5iaq5k7u24a',
        },
      },
    };

    const result = await modelWithTimestamp.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'black-forest-labs/flux-schnell',
      headers: {
        'content-length': '560',
        'content-type': 'application/json',
        'custom-response-header': 'response-header-value',
      },
    });
  });

  it('should set version in request body for versioned models', async () => {
    prepareResponse();

    const versionedModel = provider.image(
      'bytedance/sdxl-lightning-4step:5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637',
    );

    await versionedModel.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestMethod).toStrictEqual('POST');
    expect(server.calls[0].requestUrl).toStrictEqual(
      'https://api.replicate.com/v1/predictions',
    );
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: {
        prompt,
        num_outputs: 1,
      },
      version:
        '5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637',
    });
  });

  describe('Image Editing', () => {
    it('should send image when URL file is provided', async () => {
      prepareResponse();

      await model.doGenerate({
        prompt: 'Add a hat to the person',
        files: [
          {
            type: 'url',
            url: 'https://example.com/input.jpg',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchInlineSnapshot(`
        {
          "input": {
            "image": "https://example.com/input.jpg",
            "num_outputs": 1,
            "prompt": "Add a hat to the person",
          },
        }
      `);
    });

    it('should convert Uint8Array file to data URI', async () => {
      prepareResponse();

      const testImageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      await model.doGenerate({
        prompt: 'Transform this image',
        files: [
          {
            type: 'file',
            data: testImageData,
            mediaType: 'image/png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.image).toMatch(/^data:image\/png;base64,/);
      expect(requestBody.input.prompt).toBe('Transform this image');
    });

    it('should convert file with base64 string data to data URI', async () => {
      prepareResponse();

      await model.doGenerate({
        prompt: 'Edit this',
        files: [
          {
            type: 'file',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            mediaType: 'image/png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.image).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
    });

    it('should send mask for inpainting', async () => {
      prepareResponse();

      await model.doGenerate({
        prompt: 'Replace the masked area with a tree',
        files: [
          {
            type: 'url',
            url: 'https://example.com/input.jpg',
          },
        ],
        mask: {
          type: 'url',
          url: 'https://example.com/mask.png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchInlineSnapshot(`
        {
          "input": {
            "image": "https://example.com/input.jpg",
            "mask": "https://example.com/mask.png",
            "num_outputs": 1,
            "prompt": "Replace the masked area with a tree",
          },
        }
      `);
    });

    it('should warn when multiple files are provided', async () => {
      prepareResponse();

      const result = await model.doGenerate({
        prompt: 'Edit multiple images',
        files: [
          {
            type: 'url',
            url: 'https://example.com/input1.jpg',
          },
          {
            type: 'url',
            url: 'https://example.com/input2.jpg',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "This Replicate model only supports a single input image. Additional images are ignored.",
            "type": "other",
          },
        ]
      `);

      // Should only use the first image
      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.image).toBe('https://example.com/input1.jpg');
    });

    it('should pass provider options with image editing', async () => {
      prepareResponse();

      await model.doGenerate({
        prompt: 'Inpaint this area',
        files: [
          {
            type: 'url',
            url: 'https://example.com/input.jpg',
          },
        ],
        mask: {
          type: 'url',
          url: 'https://example.com/mask.png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          replicate: {
            guidance_scale: 7.5,
            num_inference_steps: 30,
            negative_prompt: 'blurry, low quality',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchInlineSnapshot(`
        {
          "input": {
            "guidance_scale": 7.5,
            "image": "https://example.com/input.jpg",
            "mask": "https://example.com/mask.png",
            "negative_prompt": "blurry, low quality",
            "num_inference_steps": 30,
            "num_outputs": 1,
            "prompt": "Inpaint this area",
          },
        }
      `);
    });
  });

  describe('Flux-2 Models', () => {
    const flux2Model = provider.image('black-forest-labs/flux-2-pro');

    it('should report maxImagesPerCall as 8 for Flux-2 models', () => {
      expect(flux2Model.maxImagesPerCall).toBe(8);
    });

    it('should report maxImagesPerCall as 1 for non-Flux-2 models', () => {
      expect(model.maxImagesPerCall).toBe(1);
    });

    it('should send single image as input_image for Flux-2 models', async () => {
      prepareResponse();

      await flux2Model.doGenerate({
        prompt: 'Generate image in similar style',
        files: [
          {
            type: 'url',
            url: 'https://example.com/reference.jpg',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchInlineSnapshot(`
        {
          "input": {
            "input_image": "https://example.com/reference.jpg",
            "num_outputs": 1,
            "prompt": "Generate image in similar style",
          },
        }
      `);
    });

    it('should send multiple images as input_image, input_image_2, etc. for Flux-2 models', async () => {
      prepareResponse();

      await flux2Model.doGenerate({
        prompt: 'Combine styles from reference images',
        files: [
          {
            type: 'url',
            url: 'https://example.com/reference1.jpg',
          },
          {
            type: 'url',
            url: 'https://example.com/reference2.jpg',
          },
          {
            type: 'url',
            url: 'https://example.com/reference3.jpg',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchInlineSnapshot(`
        {
          "input": {
            "input_image": "https://example.com/reference1.jpg",
            "input_image_2": "https://example.com/reference2.jpg",
            "input_image_3": "https://example.com/reference3.jpg",
            "num_outputs": 1,
            "prompt": "Combine styles from reference images",
          },
        }
      `);
    });

    it('should warn when more than 8 images are provided for Flux-2 models', async () => {
      prepareResponse();

      const result = await flux2Model.doGenerate({
        prompt: 'Too many images',
        files: [
          { type: 'url', url: 'https://example.com/img1.jpg' },
          { type: 'url', url: 'https://example.com/img2.jpg' },
          { type: 'url', url: 'https://example.com/img3.jpg' },
          { type: 'url', url: 'https://example.com/img4.jpg' },
          { type: 'url', url: 'https://example.com/img5.jpg' },
          { type: 'url', url: 'https://example.com/img6.jpg' },
          { type: 'url', url: 'https://example.com/img7.jpg' },
          { type: 'url', url: 'https://example.com/img8.jpg' },
          { type: 'url', url: 'https://example.com/img9.jpg' },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "Flux-2 models support up to 8 input images. Additional images are ignored.",
            "type": "other",
          },
        ]
      `);

      // Should only include 8 images
      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.input_image).toBe(
        'https://example.com/img1.jpg',
      );
      expect(requestBody.input.input_image_8).toBe(
        'https://example.com/img8.jpg',
      );
      expect(requestBody.input.input_image_9).toBeUndefined();
    });

    it('should warn and ignore mask for Flux-2 models', async () => {
      prepareResponse();

      const result = await flux2Model.doGenerate({
        prompt: 'Edit with mask',
        files: [
          {
            type: 'url',
            url: 'https://example.com/input.jpg',
          },
        ],
        mask: {
          type: 'url',
          url: 'https://example.com/mask.png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "Flux-2 models do not support mask input. The mask will be ignored.",
            "type": "other",
          },
        ]
      `);

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.mask).toBeUndefined();
    });

    it('should call correct URL for Flux-2 models', async () => {
      prepareResponse();

      await flux2Model.doGenerate({
        prompt: 'Generate something',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions',
      );
    });
  });
});
