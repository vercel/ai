import assert from 'node:assert/strict';
import { createOpenResponses } from '@ai-sdk/open-responses';
import { generateText } from 'ai';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

type InputImage = {
  type: 'input_image';
  image_url: string;
  detail?: 'auto' | 'low' | 'high';
};

function collectInputImages(body: any): InputImage[] {
  const images: InputImage[] = [];

  for (const item of body.input ?? []) {
    const content =
      item.type === 'message'
        ? item.content
        : item.type === 'function_call_output'
          ? item.output
          : undefined;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (part.type === 'input_image') {
        images.push(part);
      }
    }
  }

  return images;
}

async function main() {
  let requestBody: any;
  let validationError: Error | undefined;

  const provider = createOpenResponses({
    name: 'vllm',
    url: 'http://localhost:8000/v1/responses',
    fetch: async (_input, init) => {
      const body = init?.body;
      if (typeof body !== 'string') {
        throw new TypeError('Expected a JSON request body.');
      }
      requestBody = JSON.parse(body);

      const images = collectInputImages(requestBody);
      const invalidImage = images.find(image => image.detail == null);

      if (invalidImage != null) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                '1 validation error for ResponseInputImageParam\n' +
                'detail\n' +
                `  Field required [type=missing, input_value=${JSON.stringify(invalidImage)}, input_type=dict]`,
              type: 'invalid_request_error',
              param: 'input',
              code: 'missing',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          id: 'resp_issue_20300',
          object: 'response',
          created_at: 0,
          status: 'completed',
          model: 'test-model',
          output: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  try {
    await generateText({
      model: provider('test-model'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe these images.' },
            {
              type: 'image',
              image: png,
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: png,
              mediaType: 'image/png',
              providerOptions: {
                vllm: {
                  imageDetail: 'low',
                },
              },
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_screenshot',
              toolName: 'screenshot',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_screenshot',
              toolName: 'screenshot',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'image-data',
                    data: png.toString('base64'),
                    mediaType: 'image/png',
                  },
                  {
                    type: 'image-url',
                    url: 'https://example.com/image.png',
                    providerOptions: {
                      vllm: {
                        imageDetail: 'high',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    validationError = error as Error;
  }

  assert.ok(requestBody, 'Expected the Open Responses request to be captured.');

  const images = collectInputImages(requestBody);
  const observedDetails = images.map(image => image.detail);
  const expectedDetails = ['auto', 'low', 'auto', 'high'];

  assert.equal(
    images.length,
    expectedDetails.length,
    'Expected two user images and two tool-output images.',
  );

  console.log(
    JSON.stringify(
      {
        imageCount: images.length,
        observedDetails,
        expectedDetails,
        requestError: validationError?.message,
      },
      null,
      2,
    ),
  );

  if (
    observedDetails.some((detail, index) => detail !== expectedDetails[index])
  ) {
    throw new Error(
      'Issue #20300 reproduced: serialized input_image detail values were missing or discarded.',
    );
  }

  if (validationError != null) {
    throw validationError;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
