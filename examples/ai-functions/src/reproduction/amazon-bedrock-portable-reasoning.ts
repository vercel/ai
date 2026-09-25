import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const modelId = 'us.amazon.nova-micro-v1:0';

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
  status: number;
  responseBody: string;
};

async function main() {
  let capturedRequest: CapturedRequest | undefined;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = await request.clone().text();
      const response = await fetch(request);

      capturedRequest = {
        url: request.url,
        method: request.method,
        headers: new Headers(request.headers),
        body,
        status: response.status,
        responseBody: await response.clone().text(),
      };

      return response;
    },
  });

  let sdkError: unknown;

  try {
    await generateText({
      model: bedrock(modelId),
      prompt: 'Reply with the single word ok.',
      reasoning: 'high',
      maxRetries: 0,
    });
  } catch (error) {
    sdkError = error;
  }

  if (sdkError == null) {
    console.log(
      'Portable reasoning completed successfully for Nova Micro; issue #21487 is not present.',
    );
    return;
  }

  if (capturedRequest == null) {
    throw sdkError;
  }

  if ([401, 402, 403, 429].includes(capturedRequest.status)) {
    throw new Error(
      `Live Bedrock access blocked with HTTP ${capturedRequest.status}: ${capturedRequest.responseBody}`,
      { cause: sdkError },
    );
  }

  const requestBody = JSON.parse(capturedRequest.body) as {
    additionalModelRequestFields?: {
      reasoningConfig?: {
        maxReasoningEffort?: string;
      };
    };
  };

  const emittedEffort =
    requestBody.additionalModelRequestFields?.reasoningConfig
      ?.maxReasoningEffort;

  if (emittedEffort !== 'high') {
    throw new Error(
      `The request failed without the reported reasoningConfig field: ${capturedRequest.responseBody}`,
      { cause: sdkError },
    );
  }

  delete requestBody.additionalModelRequestFields?.reasoningConfig;
  if (
    requestBody.additionalModelRequestFields != null &&
    Object.keys(requestBody.additionalModelRequestFields).length === 0
  ) {
    delete requestBody.additionalModelRequestFields;
  }

  const directResponse = await fetch(capturedRequest.url, {
    method: capturedRequest.method,
    headers: capturedRequest.headers,
    body: JSON.stringify(requestBody),
  });
  const directResponseBody = await directResponse.text();

  if (!directResponse.ok) {
    if ([401, 402, 403, 429].includes(directResponse.status)) {
      throw new Error(
        `Live Bedrock comparison blocked with HTTP ${directResponse.status}: ${directResponseBody}`,
      );
    }

    throw new Error(
      `Nova Micro also failed after removing reasoningConfig (HTTP ${directResponse.status}): ${directResponseBody}`,
      { cause: sdkError },
    );
  }

  throw new Error(
    'ISSUE #21487 REPRODUCED: portable reasoning makes Nova Micro fail, while the same request succeeds after removing additionalModelRequestFields.reasoningConfig.',
    { cause: sdkError },
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
