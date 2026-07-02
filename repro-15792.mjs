import { generateText } from './packages/ai/dist/index.js';
import { createAmazonBedrock } from './packages/amazon-bedrock/dist/index.js';

// Reproduction for vercel/ai#15792.
//
// Expected: an s3:// image URL should be passed through to Amazon Bedrock so
// Bedrock can use its S3 image source support.
// Actual: AI SDK attempts to download the s3:// URL during prompt conversion
// and throws AI_DownloadError before the provider fetch is called.

const bedrock = createAmazonBedrock({
  region: 'us-east-1',
  apiKey: 'dummy-key',
  fetch: async () => {
    console.log('Provider fetch was reached; prompt preprocessing accepted s3://.');
    return new Response(
      JSON.stringify({
        output: { message: { content: [{ text: 'ok' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  },
});

try {
  await generateText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image.' },
          {
            type: 'file',
            data: new URL('s3://my-test-bucket/path/to/image.png'),
            mediaType: 'image/png',
          },
        ],
      },
    ],
  });
  console.log('No AI_DownloadError observed.');
} catch (error) {
  console.log(error.constructor?.name);
  console.log(error.name);
  console.log(error.message);
  console.log(error.stack?.split('\n').slice(0, 8).join('\n'));
  if (
    error?.name === 'AI_DownloadError' &&
    error?.message?.includes('got s3:')
  ) {
    console.error('REPRODUCED: s3:// image URL was rejected by downloader.');
    process.exitCode = 1;
  } else {
    throw error;
  }
}
