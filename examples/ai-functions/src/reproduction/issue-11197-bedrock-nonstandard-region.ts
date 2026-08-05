import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const region = 'us-iso-east-1';
const expectedBaseURL = `https://bedrock-runtime.${region}.c2s.ic.gov`;
const incorrectBaseURL = `https://bedrock-runtime.${region}.amazonaws.com`;

function getRequestUrl(error: unknown): string | undefined {
  if (error != null && typeof error === 'object' && 'url' in error) {
    const url = error.url;
    return typeof url === 'string' ? url : undefined;
  }

  return undefined;
}

async function main() {
  const previousEndpointOverride = process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;

  try {
    process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = expectedBaseURL;

    await generateText({
      model: createAmazonBedrock({ region })(
        'anthropic.claude-3-haiku-20240307-v1:0',
      ),
      prompt: 'Reply with OK.',
      maxOutputTokens: 2,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    const requestUrl = getRequestUrl(error);

    if (requestUrl?.startsWith(incorrectBaseURL)) {
      throw new Error(
        `Reproduced issue #11197: region ${region} resolved Bedrock Runtime to ${incorrectBaseURL} instead of ${expectedBaseURL} and ignored AWS_ENDPOINT_URL_BEDROCK_RUNTIME.`,
      );
    }

    throw error;
  } finally {
    if (previousEndpointOverride == null) {
      delete process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;
    } else {
      process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = previousEndpointOverride;
    }
  }

  console.log(
    `Bedrock Runtime request succeeded through the expected endpoint ${expectedBaseURL}.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
