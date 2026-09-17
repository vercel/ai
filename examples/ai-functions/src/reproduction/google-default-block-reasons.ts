import assert from 'node:assert/strict';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  generateImage,
  generateText,
  NoImageGeneratedError,
  streamText,
} from 'ai';

const defaultReasons = [
  '',
  'BLOCK_REASON_UNSPECIFIED',
  'BLOCKED_REASON_UNSPECIFIED',
] as const;

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ySAAAAAASUVORK5CYII=';

function emptyResponse(blockReason: string) {
  return {
    candidates: [],
    promptFeedback: { blockReason },
    usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
  };
}

const imageResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: png,
            },
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
};

const issueSignal =
  'ISSUE_20909_REPRODUCED: Google non-streaming default block reasons are content-filtered and disable image retries';

async function verifyStreamingControl(blockReason: string) {
  const google = createGoogleGenerativeAI({
    apiKey: 'fixture',
    fetch: async () =>
      new Response(`data: ${JSON.stringify(emptyResponse(blockReason))}\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = streamText({
    model: google('gemini-3.7-flash'),
    prompt: 'Fixture.',
    maxRetries: 0,
  });

  assert.equal(
    await result.finishReason,
    'other',
    `streamText(${JSON.stringify(blockReason)}) should remain "other"`,
  );
  assert.equal(
    await result.rawFinishReason,
    undefined,
    `streamText(${JSON.stringify(blockReason)}) should omit a raw finish reason`,
  );
}

async function main() {
  const failures: string[] = [];

  for (const blockReason of defaultReasons) {
    await verifyStreamingControl(blockReason);

    const textGoogle = createGoogleGenerativeAI({
      apiKey: 'fixture',
      fetch: async () => Response.json(emptyResponse(blockReason)),
    });
    const textResult = await generateText({
      model: textGoogle('gemini-3.7-flash'),
      prompt: 'Fixture.',
      maxRetries: 0,
    });

    const textAssertions = [
      () =>
        assert.equal(
          textResult.finishReason,
          'other',
          `generateText(${JSON.stringify(blockReason)}) should remain "other"`,
        ),
      () =>
        assert.equal(
          textResult.rawFinishReason,
          undefined,
          `generateText(${JSON.stringify(blockReason)}) should omit a raw finish reason`,
        ),
    ];

    for (const assertion of textAssertions) {
      try {
        assertion();
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    let calls = 0;
    const imageGoogle = createGoogleGenerativeAI({
      apiKey: 'fixture',
      fetch: async () =>
        Response.json(
          ++calls === 1 ? emptyResponse(blockReason) : imageResponse,
        ),
    });

    try {
      const imageResult = await generateImage({
        model: imageGoogle.image('gemini-3.1-flash-image-preview'),
        prompt: 'Fixture.',
        maxRetries: 2,
      });

      assert.equal(
        calls,
        2,
        `generateImage(${JSON.stringify(blockReason)}) should retry once`,
      );
      assert.equal(
        imageResult.images.length,
        1,
        `generateImage(${JSON.stringify(blockReason)}) should return the image from the retry`,
      );
    } catch (error) {
      if (NoImageGeneratedError.isInstance(error) && calls === 1) {
        failures.push(
          `generateImage(${JSON.stringify(blockReason)}) made one call and threw ${error.name}`,
        );
      } else {
        throw error;
      }
    }
  }

  const safetyGoogle = createGoogleGenerativeAI({
    apiKey: 'fixture',
    fetch: async () => Response.json(emptyResponse('SAFETY')),
  });
  const safetyResult = await generateText({
    model: safetyGoogle('gemini-3.7-flash'),
    prompt: 'Fixture.',
    maxRetries: 0,
  });

  assert.equal(
    safetyResult.finishReason,
    'content-filter',
    'a real SAFETY block must remain a content filter',
  );

  if (failures.length > 0) {
    console.error(issueSignal);
    console.error(failures.map(failure => `- ${failure}`).join('\n'));
    process.exitCode = 1;
  }
}

void main();
