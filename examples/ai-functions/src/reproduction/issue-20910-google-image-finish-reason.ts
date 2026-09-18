import assert from 'node:assert/strict';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateImage, NoImageGeneratedError } from 'ai';

const failureSignal =
  'ISSUE_20910_REPRODUCED: Google finish reasons were erased from public image diagnostics';

async function getDiagnostics(finishReason: 'IMAGE_SAFETY' | 'OTHER') {
  const google = createGoogleGenerativeAI({
    apiKey: 'fixture',
    fetch: async () =>
      Response.json({
        candidates: [{ content: { parts: [] }, finishReason }],
        usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
      }),
  });

  try {
    await generateImage({
      model: google.image('gemini-3.1-flash-image-preview'),
      prompt: 'Fixture.',
      maxRetries: 0,
    });
    assert.fail('Expected an empty-image error');
  } catch (error) {
    assert.ok(NoImageGeneratedError.isInstance(error));
    assert.equal(error.calls?.length, 1);

    const { response, ...call } = error.calls[0];
    const { timestamp: _timestamp, ...responseWithoutTimestamp } = response;

    return { ...call, response: responseWithoutTimestamp };
  }
}

async function main() {
  const blocked = await getDiagnostics('IMAGE_SAFETY');
  const unexplained = await getDiagnostics('OTHER');

  console.log(JSON.stringify({ blocked, unexplained }, null, 2));
  assert.notDeepStrictEqual(blocked, unexplained, failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
