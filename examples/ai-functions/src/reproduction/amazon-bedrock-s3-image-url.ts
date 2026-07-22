import { createAmazonBedrock } from '../../../../packages/amazon-bedrock/src';
import { generateText } from '../../../../packages/ai/src';

const imageUrl = new URL('s3://amzn-s3-demo-bucket/myImage.png');
const modelId = 'amazon.nova-lite-v1:0';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function invokeWithS3Image(options?: {
  passUrlsThrough?: boolean;
}): Promise<void> {
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });

  await generateText({
    model: bedrock(modelId),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          {
            type: 'image',
            image: imageUrl,
            mediaType: 'image/png',
          },
        ],
      },
    ],
    maxRetries: 0,
    experimental_download: options?.passUrlsThrough
      ? requestedDownloads => requestedDownloads.map(() => null)
      : undefined,
  });
}

async function main(): Promise<void> {
  let primaryError: unknown;

  try {
    await invokeWithS3Image();
  } catch (error) {
    primaryError = error;
  }

  const primaryMessage = errorMessage(primaryError);
  const expectedPrimaryFailure =
    'URL scheme must be http, https, or data, got s3:';

  if (!primaryMessage.includes(expectedPrimaryFailure)) {
    throw new Error(
      `Expected the default Bedrock image flow to reject the S3 URL with ${JSON.stringify(
        expectedPrimaryFailure,
      )}, but received: ${primaryMessage}`,
    );
  }

  let passThroughError: unknown;

  try {
    await invokeWithS3Image({ passUrlsThrough: true });
  } catch (error) {
    passThroughError = error;
  }

  const passThroughMessage = errorMessage(passThroughError);
  if (
    !passThroughMessage.includes("'File URL data' functionality not supported")
  ) {
    throw new Error(
      `Expected the pass-through comparison to reject URL-backed Bedrock files, but received: ${passThroughMessage}`,
    );
  }

  throw new Error(
    `ISSUE_15792_REPRODUCED: Amazon Bedrock rejected an s3:// image before inference: ${primaryMessage}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
