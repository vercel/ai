import { createGoogle } from '@ai-sdk/google';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { wrapEmbeddingModel } from '../middleware/wrap-embedding-model';
import { embedMany } from './embed-many';

type EmbeddingRequest = {
  content: { parts: Array<{ text: string }> };
  outputDimensionality?: number;
};

function setup() {
  const requests: EmbeddingRequest[][] = [];
  const fetch = vi.fn<FetchFunction>(async (_url, init) => {
    const body = JSON.parse(init!.body as string) as
      | EmbeddingRequest
      | { requests: EmbeddingRequest[] };
    const batch = 'requests' in body ? body.requests : [body];
    requests.push(batch);
    const embeddings = batch.map(request => {
      const context = request.content.parts.find(part =>
        part.text.startsWith('context '),
      );
      return { values: [context ? Number(context.text.slice(8)) : -1] };
    });

    return Response.json(
      'requests' in body ? { embeddings } : { embedding: embeddings[0] },
    );
  });
  const google = createGoogle({ apiKey: 'test-api-key', fetch });

  return {
    model: google.embedding('gemini-embedding-2'),
    fetch,
    requests,
  };
}

describe('embedMany with Google multimodal content', () => {
  it.each([1, 2, Infinity])(
    'preserves content alignment through wrapped models with maxParallelCalls %s',
    async maxParallelCalls => {
      const { model, requests } = setup();
      const content = Array.from({ length: 201 }, (_, index) =>
        index % 3 === 0 ? null : [{ text: `context ${index}` }],
      );
      const result = await embedMany({
        model: wrapEmbeddingModel({
          model,
          middleware: { specificationVersion: 'v4' },
        }),
        values: Array<string>(201).fill(''),
        providerOptions: { google: { content } },
        maxParallelCalls,
        maxRetries: 0,
      });

      expect(result.embeddings).toEqual(
        content.map((parts, index) => [parts === null ? -1 : index]),
      );
      expect(requests.map(batch => batch.length)).toEqual([100, 100, 1]);
      expect(requests.flat().map(request => request.content.parts)).toEqual(
        content.map(parts => parts ?? [{ text: '' }]),
      );
      expect(result.responses).toHaveLength(3);
      expect(content).toHaveLength(201);
    },
  );

  it.each([1, 101])(
    'allows middleware to normalize provider options for %s values',
    async count => {
      const { model, requests } = setup();
      await embedMany({
        model: wrapEmbeddingModel({
          model,
          middleware: {
            specificationVersion: 'v4',
            transformParams: async ({ params }) => ({
              ...params,
              providerOptions: {
                ...params.providerOptions,
                google: {
                  ...params.providerOptions?.google,
                  outputDimensionality: Number(
                    params.providerOptions?.google.outputDimensionality,
                  ),
                },
              },
            }),
          },
        }),
        values: Array<string>(count).fill('document'),
        providerOptions: {
          google: {
            outputDimensionality: '128',
            content: Array.from({ length: count }, (_, index) => [
              { text: `context ${index}` },
            ]),
          },
        },
        maxRetries: 0,
      });

      expect(
        requests.flat().map(request => request.outputDimensionality),
      ).toEqual(Array(count).fill(128));
    },
  );

  it('retries a failed batch with the same content without repeating successful batches', async () => {
    const { model, fetch, requests } = setup();
    fetch
      .mockImplementationOnce(fetch.getMockImplementation()!)
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 429,
              message: 'Rate limited',
              status: 'RESOURCE_EXHAUSTED',
            },
          },
          { status: 429, headers: { 'retry-after-ms': '0' } },
        ),
      );

    const result = await embedMany({
      model,
      values: Array<string>(201).fill(''),
      providerOptions: {
        google: {
          content: Array.from({ length: 201 }, (_, index) => [
            { text: `context ${index}` },
          ]),
        },
      },
      maxParallelCalls: 1,
      maxRetries: 1,
    });

    expect(result.embeddings).toEqual(
      Array.from({ length: 201 }, (_, index) => [index]),
    );
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[1][1]?.body).toBe(fetch.mock.calls[2][1]?.body);
    expect(requests.map(batch => batch.length)).toEqual([100, 100, 1]);
    expect(result.responses).toHaveLength(3);
  });

  it('rejects mismatched content before making any requests', async () => {
    const { model, fetch } = setup();

    await expect(
      embedMany({
        model,
        values: Array<string>(101).fill('document'),
        providerOptions: { google: { content: Array(100).fill(null) } },
        maxRetries: 0,
      }),
    ).rejects.toThrow(
      'The number of multimodal content entries (100) must match the number of values (101).',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates malformed content when its batch is processed', async () => {
    const { model, requests } = setup();

    await expect(
      embedMany({
        model,
        values: Array<string>(101).fill('document'),
        providerOptions: {
          google: { content: [...Array(100).fill(null), [{ text: 123 }]] },
        },
        maxParallelCalls: 1,
        maxRetries: 0,
      }),
    ).rejects.toThrow('invalid google provider options');
    expect(requests.map(batch => batch.length)).toEqual([100]);
  });
});
