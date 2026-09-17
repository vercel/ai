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
];

const emptyResponse = (blockReason: string) => ({
  candidates: [],
  promptFeedback: { blockReason },
  usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
});

const imageResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ySAAAAAASUVORK5CYII=',
            },
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
};

async function main() {
  const failures: string[] = [];

  for (const blockReason of defaultReasons) {
    const textProvider = createGoogleGenerativeAI({
      apiKey: 'fixture',
      fetch: async () => Response.json(emptyResponse(blockReason)),
    });
    const textResult = await generateText({
      model: textProvider('gemini-3.7-flash'),
      prompt: 'Fixture.',
      maxRetries: 0,
    });

    try {
      assert.equal(textResult.finishReason, 'other');
      assert.equal(textResult.rawFinishReason, undefined);
    } catch {
      failures.push(
        `generateText(${JSON.stringify(blockReason)}): finishReason=${JSON.stringify(textResult.finishReason)}, rawFinishReason=${JSON.stringify(textResult.rawFinishReason)}`,
      );
    }

    const streamingProvider = createGoogleGenerativeAI({
      apiKey: 'fixture',
      fetch: async () =>
        new Response(
          `data: ${JSON.stringify(emptyResponse(blockReason))}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    });
    const streamingResult = streamText({
      model: streamingProvider('gemini-3.7-flash'),
      prompt: 'Fixture.',
      maxRetries: 0,
    });
    await streamingResult.consumeStream();
    assert.equal(await streamingResult.finishReason, 'other');
    assert.equal(await streamingResult.rawFinishReason, undefined);

    let imageCalls = 0;
    let imageCount = 0;
    let noImageGenerated = false;
    const imageProvider = createGoogleGenerativeAI({
      apiKey: 'fixture',
      fetch: async () =>
        Response.json(
          ++imageCalls === 1 ? emptyResponse(blockReason) : imageResponse,
        ),
    });

    try {
      const imageResult = await generateImage({
        model: imageProvider.image('gemini-3.1-flash-image-preview'),
        prompt: 'Fixture.',
        maxRetries: 2,
      });
      imageCount = imageResult.images.length;
    } catch (error) {
      if (!NoImageGeneratedError.isInstance(error)) {
        throw error;
      }
      noImageGenerated = true;
    }

    try {
      assert.equal(imageCalls, 2);
      assert.equal(imageCount, 1);
      assert.equal(noImageGenerated, false);
    } catch {
      failures.push(
        `generateImage(${JSON.stringify(blockReason)}): calls=${imageCalls}, images=${imageCount}, noImageGenerated=${noImageGenerated}`,
      );
    }
  }

  const safetyProvider = createGoogleGenerativeAI({
    apiKey: 'fixture',
    fetch: async () => Response.json(emptyResponse('SAFETY')),
  });
  const safetyResult = await generateText({
    model: safetyProvider('gemini-3.7-flash'),
    prompt: 'Fixture.',
    maxRetries: 0,
  });
  assert.equal(safetyResult.finishReason, 'content-filter');
  assert.equal(safetyResult.rawFinishReason, 'SAFETY');

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    throw new Error(
      'ISSUE_20909_PRIMARY_FAILURE: default Google block reasons are classified as content filters and disable image retries',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
