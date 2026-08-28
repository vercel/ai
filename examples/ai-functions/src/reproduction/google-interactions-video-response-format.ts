import { createGoogle } from '@ai-sdk/google';
import type { JSONObject } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import assert from 'node:assert/strict';
import { generateText, streamText } from 'ai';
import { createGoogleVertex } from '../../../../packages/google-vertex/src/google-vertex-provider-base';

const modelId = 'gemini-omni-1.1-flash';
const prompt =
  'Generate a four-second landscape video of a red ball rolling across a white floor.';
const videoData = 'AAAAIGZ0eXBpc29t';

type ProviderCase = {
  name: string;
  model: Parameters<typeof generateText>[0]['model'];
  expectedResponseFormat: JSONObject;
  providerOptions: JSONObject;
};

function createMockFetch(): FetchFunction {
  return async (_url, init) => {
    const requestBody = init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const body = JSON.parse(requestBody) as {
      model?: string;
      response_modalities?: Array<string>;
      response_format?: Array<Record<string, unknown>>;
      stream?: boolean;
    };

    assert.equal(body.model, modelId);
    assert.deepEqual(body.response_modalities, ['video']);
    assert.equal(body.response_format?.length, 1);

    if (body.stream === true) {
      const events = [
        {
          interaction: {
            id: '',
            status: 'in_progress',
            object: 'interaction',
            model: modelId,
          },
          event_type: 'interaction.created',
        },
        {
          interaction_id: '',
          status: 'in_progress',
          event_type: 'interaction.status_update',
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'video',
            mime_type: 'video/mp4',
            data: videoData,
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          interaction: {
            id: '',
            status: 'completed',
            usage: {
              total_tokens: 6465,
              total_input_tokens: 18,
              total_output_tokens: 6166,
              total_thought_tokens: 281,
              total_cached_tokens: 0,
              total_tool_use_tokens: 0,
              output_tokens_by_modality: [{ modality: 'video', tokens: 5793 }],
            },
            object: 'interaction',
            model: modelId,
          },
          event_type: 'interaction.completed',
        },
      ];

      return new Response(
        events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }

    return Response.json({
      status: 'completed',
      usage: {
        total_tokens: 6465,
        total_input_tokens: 18,
        total_output_tokens: 6166,
        total_thought_tokens: 281,
        total_cached_tokens: 0,
        total_tool_use_tokens: 0,
        output_tokens_by_modality: [{ modality: 'video', tokens: 5793 }],
      },
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'video', mime_type: 'video/mp4', data: videoData }],
        },
      ],
      object: 'interaction',
      model: modelId,
    });
  };
}

function isVideoResponseFormatValidationError(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if (
      current.name === 'AI_InvalidArgumentError' &&
      current.message === 'invalid google provider options'
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function verifyGenerateText(providerCase: ProviderCase) {
  const result = await generateText({
    model: providerCase.model,
    prompt,
    providerOptions: {
      google: providerCase.providerOptions,
    },
  });

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].mediaType, 'video/mp4');
  assert.equal(result.files[0].base64, videoData);
  assert.deepEqual(
    (
      result.request.body as {
        response_format?: Array<Record<string, unknown>>;
      }
    ).response_format,
    [providerCase.expectedResponseFormat],
  );
}

async function verifyStreamText(providerCase: ProviderCase) {
  const result = streamText({
    model: providerCase.model,
    prompt,
    providerOptions: {
      google: providerCase.providerOptions,
    },
  });

  const files = [];
  for await (const part of result.fullStream) {
    if (part.type === 'file') {
      files.push(part.file);
    }
    if (part.type === 'error') {
      throw part.error;
    }
  }

  assert.equal(files.length, 1);
  assert.equal(files[0].mediaType, 'video/mp4');
  assert.equal(files[0].base64, videoData);
  assert.deepEqual(
    (
      (await result.request).body as {
        response_format?: Array<Record<string, unknown>>;
      }
    ).response_format,
    [providerCase.expectedResponseFormat],
  );
}

async function main() {
  const google = createGoogle({
    apiKey: 'reproduction-key',
    fetch: createMockFetch(),
  });
  const vertex = createGoogleVertex({
    project: 'reproduction-project',
    location: 'global',
    headers: { Authorization: 'Bearer reproduction-token' },
    fetch: createMockFetch(),
  });

  const cases: Array<ProviderCase> = [
    {
      name: '@ai-sdk/google',
      model: google.interactions(modelId),
      providerOptions: {
        responseModalities: ['video'],
        responseFormat: [
          {
            type: 'video',
            aspectRatio: '16:9',
            resolution: '360p',
            duration: '4s',
            delivery: 'inline',
          },
        ],
      },
      expectedResponseFormat: {
        type: 'video',
        aspect_ratio: '16:9',
        resolution: '360p',
        duration: '4s',
        delivery: 'inline',
      },
    },
    {
      name: '@ai-sdk/google-vertex',
      model: vertex.interactions(modelId),
      providerOptions: {
        responseModalities: ['video'],
        responseFormat: [
          {
            type: 'video',
            aspectRatio: '16:9',
            resolution: '360p',
            duration: '4s',
            delivery: 'uri',
            gcsUri: 'gs://reproduction-bucket/video.mp4',
          },
        ],
      },
      expectedResponseFormat: {
        type: 'video',
        aspect_ratio: '16:9',
        resolution: '360p',
        duration: '4s',
        delivery: 'uri',
        gcs_uri: 'gs://reproduction-bucket/video.mp4',
      },
    },
  ];

  const rejected: Array<string> = [];

  for (const providerCase of cases) {
    for (const [api, verify] of [
      ['generateText', verifyGenerateText],
      ['streamText', verifyStreamText],
    ] as const) {
      try {
        await verify(providerCase);
      } catch (error) {
        if (!isVideoResponseFormatValidationError(error)) {
          throw error;
        }
        rejected.push(`${providerCase.name} ${api}`);
      }
    }
  }

  if (rejected.length > 0) {
    throw new Error(
      `Issue #19945 reproduced: documented video responseFormat was rejected before fetch by ${rejected.join(', ')}`,
    );
  }

  console.log(
    'Issue #19945 not reproduced: video responseFormat reached both Interactions adapters and produced MP4 files.',
  );
}

await main();
