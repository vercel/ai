import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { FalArtifactModel } from './fal-artifact-model';

const defaultOptions = {
  prompt: undefined,
  inputs: undefined,
  providerOptions: {},
} as const;

const modelFile = {
  url: 'https://fal.media/files/model.glb',
  content_type: 'model/gltf-binary',
  file_name: 'model.glb',
  file_size: 1024,
};

const imageInput = (name: string) => ({
  type: 'url' as const,
  url: `https://example.com/${name}.png`,
  mediaType: 'image/png',
});

const artifactInput = (name: string) => ({
  type: 'url' as const,
  url: `https://example.com/${name}.glb`,
  mediaType: 'model/gltf-binary',
});

function createModel({
  modelId = 'tripo3d/h3.1/text-to-3d',
  headers,
  fetch,
  currentDate,
}: {
  modelId?: string;
  headers?: Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
} = {}) {
  return new FalArtifactModel(modelId, {
    provider: 'fal.artifact',
    url: ({ path }) => path,
    headers: () => headers ?? { Authorization: 'Key secret' },
    fetch,
    _internal: { currentDate },
  });
}

function queueResponse(modelId: string, requestId: string) {
  const requestUrl = `https://queue.fal.run/${modelId}/requests/${requestId}`;
  return {
    type: 'json-value' as const,
    body: {
      request_id: requestId,
      response_url: requestUrl,
      status_url: `${requestUrl}/status`,
    },
  };
}

function completedStatus(responseUrl: string) {
  return {
    type: 'json-value' as const,
    body: { status: 'COMPLETED', response_url: responseUrl },
  };
}

describe('FalArtifactModel', () => {
  const server = createTestServer({
    'https://queue.fal.run/tripo3d/h3.1/text-to-3d': {
      response: queueResponse('tripo3d/h3.1/text-to-3d', 'text-request'),
    },
    'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request': {
      response: {
        type: 'json-value',
        body: { model_mesh: modelFile, model_urls: { glb: modelFile } },
      },
    },
    'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request/status':
      {
        response: completedStatus(
          'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request',
        ),
      },
    'https://queue.fal.run/tripo3d/h3.1/image-to-3d': {
      response: queueResponse('tripo3d/h3.1/image-to-3d', 'image-request'),
    },
    'https://queue.fal.run/tripo3d/h3.1/image-to-3d/requests/image-request': {
      response: { type: 'json-value', body: { model_mesh: modelFile } },
    },
    'https://queue.fal.run/tripo3d/h3.1/image-to-3d/requests/image-request/status':
      {
        response: completedStatus(
          'https://queue.fal.run/tripo3d/h3.1/image-to-3d/requests/image-request',
        ),
      },
    'https://queue.fal.run/tripo3d/h3.1/multiview-to-3d': {
      response: queueResponse(
        'tripo3d/h3.1/multiview-to-3d',
        'multiview-request',
      ),
    },
    'https://queue.fal.run/tripo3d/h3.1/multiview-to-3d/requests/multiview-request':
      {
        response: { type: 'json-value', body: { model_mesh: modelFile } },
      },
    'https://queue.fal.run/tripo3d/h3.1/multiview-to-3d/requests/multiview-request/status':
      {
        response: completedStatus(
          'https://queue.fal.run/tripo3d/h3.1/multiview-to-3d/requests/multiview-request',
        ),
      },
    'https://queue.fal.run/fal-ai/meshy/v5/remesh': {
      response: queueResponse('fal-ai/meshy/v5/remesh', 'remesh-request'),
    },
    'https://queue.fal.run/fal-ai/meshy/v5/remesh/requests/remesh-request': {
      response: {
        type: 'json-value',
        body: { model_glb: modelFile, model_urls: { glb: modelFile } },
      },
    },
    'https://queue.fal.run/fal-ai/meshy/v5/remesh/requests/remesh-request/status':
      {
        response: completedStatus(
          'https://queue.fal.run/fal-ai/meshy/v5/remesh/requests/remesh-request',
        ),
      },
    'https://queue.fal.run/fal-ai/hunyuan-3d/v3.1/smart-topology': {
      response: queueResponse(
        'fal-ai/hunyuan-3d/v3.1/smart-topology',
        'topology-request',
      ),
    },
    'https://queue.fal.run/fal-ai/hunyuan-3d/v3.1/smart-topology/requests/topology-request':
      {
        response: {
          type: 'json-value',
          body: { model_glb: modelFile, model_urls: { glb: modelFile } },
        },
      },
    'https://queue.fal.run/fal-ai/hunyuan-3d/v3.1/smart-topology/requests/topology-request/status':
      {
        response: completedStatus(
          'https://queue.fal.run/fal-ai/hunyuan-3d/v3.1/smart-topology/requests/topology-request',
        ),
      },
    'https://evil.example/accepted-job': {
      response: { type: 'json-value', body: { model_mesh: modelFile } },
    },
    'https://queue.fal.run/requests/foreign-request/status': {
      response: completedStatus('https://evil.example/accepted-job'),
    },
  });

  it('exposes the artifact model identity', () => {
    const model = createModel();

    expect(model.provider).toBe('fal.artifact');
    expect(model.modelId).toBe('tripo3d/h3.1/text-to-3d');
    expect(model.specificationVersion).toBe('v4');
  });

  it('uses the exact Fal text-to-3D endpoint without adding a prefix', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      prompt: 'A low-poly red fox',
      providerOptions: {
        fal: {
          faceLimit: 25_000,
          geometryQuality: 'detailed',
          targetFormats: ['glb', 'fbx'],
          pollIntervalMs: 5,
          pollTimeoutMs: 100,
        },
      },
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://queue.fal.run/tripo3d/h3.1/text-to-3d',
    );
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      prompt: 'A low-poly red fox',
      face_limit: 25_000,
      geometry_quality: 'detailed',
      target_formats: ['glb', 'fbx'],
    });
  });

  it('maps an image input to image_url', async () => {
    await createModel({
      modelId: 'tripo3d/h3.1/image-to-3d',
    }).doGenerate({
      ...defaultOptions,
      inputs: [{ type: 'url', url: 'https://example.com/front.png' }],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      image_url: 'https://example.com/front.png',
    });
  });

  it('encodes binary image input as a data URI', async () => {
    await createModel({
      modelId: 'tripo3d/h3.1/image-to-3d',
    }).doGenerate({
      ...defaultOptions,
      inputs: [
        {
          type: 'file',
          data: new Uint8Array([137, 80, 78, 71]),
          mediaType: 'image/png',
          filename: 'front.png',
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      image_url: 'data:image/png;base64,iVBORw==',
    });
  });

  it('maps all multiview inputs to image_urls', async () => {
    await createModel({
      modelId: 'tripo3d/h3.1/multiview-to-3d',
    }).doGenerate({
      ...defaultOptions,
      inputs: [
        { type: 'url', url: 'https://example.com/front.png' },
        { type: 'url', url: 'https://example.com/back.png' },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      image_urls: [
        'https://example.com/front.png',
        'https://example.com/back.png',
      ],
    });
  });

  it('maps remesh input to model_url', async () => {
    await createModel({ modelId: 'fal-ai/meshy/v5/remesh' }).doGenerate({
      ...defaultOptions,
      inputs: [
        {
          type: 'url',
          url: 'https://example.com/source.glb',
          mediaType: 'model/gltf-binary',
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model_url: 'https://example.com/source.glb',
    });
  });

  it('maps smart-topology input to input_file_url', async () => {
    await createModel({
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
    }).doGenerate({
      ...defaultOptions,
      inputs: [{ type: 'url', url: 'https://example.com/source.glb' }],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input_file_url: 'https://example.com/source.glb',
      input_file_type: 'glb',
    });
  });

  it('accepts an inferred 3D file type for remeshing', async () => {
    await createModel({ modelId: 'fal-ai/meshy/v5/remesh' }).doGenerate({
      ...defaultOptions,
      inputs: [
        {
          type: 'file',
          data: new Uint8Array([1, 2, 3]),
          mediaType: 'application/x-fbx',
          filename: 'source.fbx',
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model_url: 'data:application/x-fbx;base64,AQID',
    });
  });

  it.each([
    {
      name: 'GLB from a filename',
      input: {
        type: 'url' as const,
        url: 'https://example.com/download/model',
        filename: 'source.glb',
        mediaType: 'application/octet-stream',
      },
      expectedInputFileType: 'glb',
    },
    {
      name: 'OBJ from its media type',
      input: {
        type: 'url' as const,
        url: 'https://example.com/download/model',
        mediaType: 'model/obj',
      },
      expectedInputFileType: 'obj',
    },
    {
      name: 'OBJ from a filename with a generic text media type',
      input: {
        type: 'url' as const,
        url: 'https://example.com/download/model',
        filename: 'source.obj',
        mediaType: 'text/plain',
      },
      expectedInputFileType: 'obj',
    },
  ])(
    'infers smart-topology $name',
    async ({ input, expectedInputFileType }) => {
      await createModel({
        modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
      }).doGenerate({
        ...defaultOptions,
        inputs: [input],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        input_file_url: 'https://example.com/download/model',
        input_file_type: expectedInputFileType,
      });
    },
  );

  it('uses an explicit smart-topology input type for an opaque URL', async () => {
    await createModel({
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
    }).doGenerate({
      ...defaultOptions,
      inputs: [{ type: 'url', url: 'https://example.com/download/model' }],
      providerOptions: { fal: { inputFileType: 'obj' } },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input_file_url: 'https://example.com/download/model',
      input_file_type: 'obj',
    });
  });

  it.each([
    {
      name: 'an unsupported FBX input',
      input: {
        type: 'url' as const,
        url: 'https://example.com/source.fbx?download=1',
        mediaType: 'application/x-fbx',
      },
      providerOptions: undefined,
      argument: 'inputs',
    },
    {
      name: 'an ambiguous opaque input',
      input: {
        type: 'url' as const,
        url: 'https://example.com/download/model',
      },
      providerOptions: undefined,
      argument: 'providerOptions.fal.inputFileType',
    },
    {
      name: 'an explicit type that conflicts with the input',
      input: {
        type: 'url' as const,
        url: 'https://example.com/source.glb',
        mediaType: 'model/gltf-binary',
      },
      providerOptions: { fal: { inputFileType: 'obj' as const } },
      argument: 'providerOptions.fal.inputFileType',
    },
    {
      name: 'conflicting filename and media type metadata',
      input: {
        type: 'url' as const,
        url: 'https://example.com/download/model',
        filename: 'source.glb',
        mediaType: 'model/obj',
      },
      providerOptions: undefined,
      argument: 'inputs',
    },
  ])(
    'rejects smart-topology with $name before dispatch',
    async ({ input, providerOptions, argument }) => {
      let fetchCalls = 0;
      const model = createModel({
        modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
        fetch: async () => {
          fetchCalls++;
          return Response.json({});
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          inputs: [input],
          ...(providerOptions != null ? { providerOptions } : {}),
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument,
      });
      expect(fetchCalls).toBe(0);
    },
  );

  it('can pass a generated opaque artifact into remeshing', async () => {
    server.urls[
      'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request'
    ].response = {
      type: 'json-value',
      body: {
        model_mesh: {
          url: 'https://fal.media/files/model.fbx',
          content_type: 'application/octet-stream',
          file_name: 'model.fbx',
        },
      },
    };

    const generated = await createModel().doGenerate({
      ...defaultOptions,
      prompt: 'A chair',
    });
    const generatedArtifact = generated.artifacts[0];

    expect(generatedArtifact.type).toBe('url');
    if (generatedArtifact.type !== 'url') {
      throw new Error('Expected a URL artifact');
    }

    await createModel({ modelId: 'fal-ai/meshy/v5/remesh' }).doGenerate({
      ...defaultOptions,
      inputs: [generatedArtifact],
    });

    const remeshSubmission = server.calls.find(
      call =>
        call.requestMethod === 'POST' &&
        call.requestUrl === 'https://queue.fal.run/fal-ai/meshy/v5/remesh',
    );
    expect(await remeshSubmission?.requestBodyJson).toStrictEqual({
      model_url: 'https://fal.media/files/model.fbx',
    });
  });

  it.each([
    {
      name: 'text-to-3D without a prompt',
      modelId: 'tripo3d/h3.1/text-to-3d',
      prompt: undefined,
      inputs: undefined,
      argument: 'prompt',
    },
    {
      name: 'text-to-3D with a file input',
      modelId: 'tripo3d/h3.1/text-to-3d',
      prompt: 'A chair',
      inputs: [imageInput('front')],
      argument: 'inputs',
    },
    {
      name: 'image-to-3D without an input',
      modelId: 'tripo3d/h3.1/image-to-3d',
      prompt: undefined,
      inputs: undefined,
      argument: 'inputs',
    },
    {
      name: 'image-to-3D with multiple inputs',
      modelId: 'tripo3d/h3.1/image-to-3d',
      prompt: undefined,
      inputs: [imageInput('front'), imageInput('back')],
      argument: 'inputs',
    },
    {
      name: 'image-to-3D with a prompt',
      modelId: 'tripo3d/h3.1/image-to-3d',
      prompt: 'A chair',
      inputs: [imageInput('front')],
      argument: 'prompt',
    },
    {
      name: 'image-to-3D with a model input',
      modelId: 'tripo3d/h3.1/image-to-3d',
      prompt: undefined,
      inputs: [artifactInput('source')],
      argument: 'inputs',
    },
    {
      name: 'multiview-to-3D with one input',
      modelId: 'tripo3d/h3.1/multiview-to-3d',
      prompt: undefined,
      inputs: [imageInput('front')],
      argument: 'inputs',
    },
    {
      name: 'multiview-to-3D with five inputs',
      modelId: 'tripo3d/h3.1/multiview-to-3d',
      prompt: undefined,
      inputs: [
        imageInput('front'),
        imageInput('back'),
        imageInput('left'),
        imageInput('right'),
        imageInput('top'),
      ],
      argument: 'inputs',
    },
    {
      name: 'multiview-to-3D with a model input',
      modelId: 'tripo3d/h3.1/multiview-to-3d',
      prompt: undefined,
      inputs: [imageInput('front'), artifactInput('source')],
      argument: 'inputs',
    },
    {
      name: 'remesh without an input',
      modelId: 'fal-ai/meshy/v5/remesh',
      prompt: undefined,
      inputs: undefined,
      argument: 'inputs',
    },
    {
      name: 'remesh with multiple inputs',
      modelId: 'fal-ai/meshy/v5/remesh',
      prompt: undefined,
      inputs: [artifactInput('first'), artifactInput('second')],
      argument: 'inputs',
    },
    {
      name: 'remesh with an image input',
      modelId: 'fal-ai/meshy/v5/remesh',
      prompt: undefined,
      inputs: [imageInput('source')],
      argument: 'inputs',
    },
    {
      name: 'smart-topology without an input',
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
      prompt: undefined,
      inputs: undefined,
      argument: 'inputs',
    },
    {
      name: 'smart-topology with multiple inputs',
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
      prompt: undefined,
      inputs: [artifactInput('first'), artifactInput('second')],
      argument: 'inputs',
    },
    {
      name: 'smart-topology with an image input',
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
      prompt: undefined,
      inputs: [imageInput('source')],
      argument: 'inputs',
    },
    {
      name: 'smart-topology with a prompt',
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
      prompt: 'Retopologize this model',
      inputs: [artifactInput('source')],
      argument: 'prompt',
    },
  ])(
    'rejects $name before dispatch',
    async ({ modelId, prompt, inputs, argument }) => {
      let fetchCalls = 0;
      const model = createModel({
        modelId,
        fetch: async () => {
          fetchCalls++;
          return Response.json({});
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          prompt,
          inputs,
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument,
      });
      expect(fetchCalls).toBe(0);
    },
  );

  it('polls through explicit progress responses until completion', async () => {
    let pollCount = 0;
    const model = createModel({
      fetch: async (url, init) => {
        if (init?.method === 'POST') {
          return Response.json({
            request_id: 'progress-request',
            response_url:
              'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/progress-request/response',
            status_url:
              'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/progress-request/status',
          });
        }

        if (String(url).endsWith('/status')) {
          pollCount++;
          return Response.json(
            pollCount < 3
              ? { status: 'IN_PROGRESS' }
              : {
                  status: 'COMPLETED',
                  response_url:
                    'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/progress-request/response',
                },
          );
        }

        return Response.json({ model_mesh: modelFile });
      },
    });

    const result = await model.doGenerate({
      ...defaultOptions,
      prompt: 'A chair',
      providerOptions: { fal: { pollIntervalMs: 1 } },
    });

    expect(pollCount).toBe(3);
    expect(result.artifacts[0]).toMatchObject({
      type: 'url',
      url: modelFile.url,
    });
  });

  it('surfaces a completed queue error without fetching a result', async () => {
    let resultFetches = 0;
    const model = createModel({
      fetch: async (url, init) => {
        if (init?.method === 'POST') {
          return Response.json({
            request_id: 'failed-request',
            response_url:
              'https://queue.fal.run/requests/failed-request/response',
            status_url: 'https://queue.fal.run/requests/failed-request/status',
          });
        }

        if (String(url).endsWith('/status')) {
          return Response.json({
            status: 'COMPLETED',
            error: 'Mesh generation failed',
            error_type: 'generation_error',
          });
        }

        resultFetches++;
        return Response.json({ model_mesh: modelFile });
      },
    });

    await expect(
      model.doGenerate({ ...defaultOptions, prompt: 'A chair' }),
    ).rejects.toMatchObject({
      jobAccepted: true,
      requestId: 'failed-request',
      message: 'Mesh generation failed',
    });
    expect(resultFetches).toBe(0);
  });

  it('deduplicates primary and variant files while preserving metadata', async () => {
    server.urls[
      'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request'
    ].response = {
      type: 'json-value',
      body: {
        model_mesh: modelFile,
        model_urls: {
          glb: modelFile,
          pbr_model: {
            url: 'https://fal.media/files/pbr.glb',
            content_type: 'model/gltf-binary',
            file_name: 'pbr.glb',
            file_size: 2048,
          },
        },
        rendered_image: {
          url: 'https://fal.media/files/preview.png',
          content_type: 'image/png',
          file_name: 'preview.png',
          file_size: 512,
        },
      },
    };

    const result = await createModel().doGenerate({
      ...defaultOptions,
      prompt: 'A chair',
    });

    expect(result.artifacts).toStrictEqual([
      {
        type: 'url',
        url: modelFile.url,
        mediaType: 'model/gltf-binary',
        filename: 'model.glb',
        role: 'model_mesh',
      },
      {
        type: 'url',
        url: 'https://fal.media/files/pbr.glb',
        mediaType: 'model/gltf-binary',
        filename: 'pbr.glb',
        role: 'pbr_model',
      },
      {
        type: 'url',
        url: 'https://fal.media/files/preview.png',
        mediaType: 'image/png',
        filename: 'preview.png',
        role: 'preview',
      },
    ]);
    expect(result.providerMetadata).toStrictEqual({
      fal: {
        requestId: 'text-request',
        renderedImage: {
          url: 'https://fal.media/files/preview.png',
          contentType: 'image/png',
          fileName: 'preview.png',
          fileSize: 512,
        },
      },
    });
  });

  it('rejects a malformed artifact URL after the job is accepted', async () => {
    server.urls[
      'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request'
    ].response = {
      type: 'json-value',
      body: {
        model_mesh: {
          ...modelFile,
          url: 'not-an-absolute-url',
        },
      },
    };

    await expect(
      createModel().doGenerate({ ...defaultOptions, prompt: 'A chair' }),
    ).rejects.toMatchObject({
      jobAccepted: true,
      requestId: 'text-request',
    });
  });

  it('supports model_glb response shapes', async () => {
    const remesh = await createModel({
      modelId: 'fal-ai/meshy/v5/remesh',
    }).doGenerate({ ...defaultOptions, inputs: [artifactInput('source')] });
    const topology = await createModel({
      modelId: 'fal-ai/hunyuan-3d/v3.1/smart-topology',
    }).doGenerate({ ...defaultOptions, inputs: [artifactInput('source')] });

    expect(remesh.artifacts).toHaveLength(1);
    expect(remesh.artifacts[0]).toMatchObject({ role: 'model_glb' });
    expect(topology.artifacts).toHaveLength(1);
    expect(topology.artifacts[0]).toMatchObject({ role: 'model_glb' });
  });

  it('does not send credentials to a foreign response URL', async () => {
    server.urls['https://queue.fal.run/tripo3d/h3.1/text-to-3d'].response = {
      type: 'json-value',
      body: {
        request_id: 'foreign-request',
        response_url: 'https://evil.example/accepted-job',
        status_url: 'https://queue.fal.run/requests/foreign-request/status',
      },
    };

    await createModel().doGenerate({
      ...defaultOptions,
      prompt: 'A chair',
    });

    const pollCall = server.calls.find(
      call => call.requestUrl === 'https://evil.example/accepted-job',
    );
    expect(pollCall).toBeDefined();
    expect(pollCall?.requestHeaders.authorization).toBeUndefined();
  });

  it('marks malformed accepted-job output so callers suppress fallback', async () => {
    server.urls[
      'https://queue.fal.run/tripo3d/h3.1/text-to-3d/requests/text-request'
    ].response = { type: 'json-value', body: {} };

    await expect(
      createModel().doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
      }),
    ).rejects.toMatchObject({
      jobAccepted: true,
      requestId: 'text-request',
      message: 'No artifact files in response',
    });
  });

  it('does not mark queue submission failures as accepted', async () => {
    server.urls['https://queue.fal.run/tripo3d/h3.1/text-to-3d'].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: { message: 'Invalid prompt', code: 400 },
      }),
    };

    try {
      await createModel().doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
      });
      throw new Error('Expected submission to fail');
    } catch (error) {
      expect(error).not.toHaveProperty('jobAccepted');
    }
  });

  it('marks queue submission transport failures as potentially accepted', async () => {
    const model = createModel({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await expect(
      model.doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
      }),
    ).rejects.toMatchObject({
      jobMayHaveBeenAccepted: true,
    });
  });

  it('does not dispatch or mark an already-aborted submission', async () => {
    const abortController = new AbortController();
    abortController.abort();
    let fetchCalls = 0;
    const model = createModel({
      fetch: async () => {
        fetchCalls++;
        return Response.json({});
      },
    });

    try {
      await model.doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
        abortSignal: abortController.signal,
      });
      throw new Error('Expected submission to be aborted');
    } catch (error) {
      expect(error).not.toHaveProperty('jobMayHaveBeenAccepted');
      expect(error).not.toHaveProperty('jobAccepted');
    }
    expect(fetchCalls).toBe(0);
  });

  it('marks malformed successful queue responses as potentially accepted', async () => {
    server.urls['https://queue.fal.run/tripo3d/h3.1/text-to-3d'].response = {
      type: 'json-value',
      body: { request_id: 123 },
    };

    await expect(
      createModel().doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
      }),
    ).rejects.toMatchObject({
      jobAccepted: true,
    });
  });

  it('marks timeouts after acceptance', async () => {
    const model = createModel({
      fetch: async (_url, init) => {
        if (init?.method === 'POST') {
          return Response.json({
            request_id: 'timeout-request',
            response_url:
              'https://queue.fal.run/requests/timeout-request/response',
            status_url: 'https://queue.fal.run/requests/timeout-request/status',
          });
        }

        return Response.json({ status: 'IN_PROGRESS' });
      },
    });

    await expect(
      model.doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
        providerOptions: {
          fal: { pollIntervalMs: 1, pollTimeoutMs: 5 },
        },
      }),
    ).rejects.toMatchObject({
      jobAccepted: true,
      requestId: 'timeout-request',
      message: expect.stringContaining('timed out'),
    });
  });

  it('marks aborts that happen after submission is accepted', async () => {
    const abortController = new AbortController();
    const model = createModel({
      fetch: async (_url, init) => {
        if (init?.method === 'POST') {
          abortController.abort();
          return Response.json({
            request_id: 'abort-request',
            response_url:
              'https://queue.fal.run/requests/abort-request/response',
            status_url: 'https://queue.fal.run/requests/abort-request/status',
          });
        }

        return Response.json({ status: 'IN_PROGRESS' });
      },
    });

    await expect(
      model.doGenerate({
        ...defaultOptions,
        prompt: 'A chair',
        abortSignal: abortController.signal,
      }),
    ).rejects.toMatchObject({
      jobAccepted: true,
      requestId: 'abort-request',
      message: 'Artifact generation request was aborted',
    });
  });
});
