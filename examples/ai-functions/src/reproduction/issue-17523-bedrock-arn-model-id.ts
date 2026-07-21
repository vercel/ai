import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError } from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';

const region = 'eu-west-1';
const liveModelId =
  'arn:aws:bedrock:eu-west-1:474668406012:inference-profile/eu.amazon.nova-lite-v1:0';

async function getRoutingResult(modelId: string) {
  const baseUrl = `https://bedrock-runtime.${region}.amazonaws.com/model`;
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  };

  const [encodedResponse, unencodedResponse] = await Promise.all([
    fetch(`${baseUrl}/${encodeURIComponent(modelId)}/converse`, request),
    fetch(`${baseUrl}/${modelId}/converse`, request),
  ]);
  const [encodedBody, unencodedBody] = await Promise.all([
    encodedResponse.text(),
    unencodedResponse.text(),
  ]);

  return {
    encodedStatus: encodedResponse.status,
    encodedBody,
    unencodedStatus: unencodedResponse.status,
    unencodedBody,
  };
}

async function main() {
  const [applicationProfileRouting, foundationModelRouting] = await Promise.all(
    [
      getRoutingResult(
        'arn:aws:bedrock:eu-west-1:123456789012:application-inference-profile/abcdefghijkl',
      ),
      getRoutingResult(
        'arn:aws:bedrock:eu-west-1::foundation-model/amazon.nova-lite-v1:0',
      ),
    ],
  );

  const requestedUrls: string[] = [];
  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      requestedUrls.push(input.toString());
      return fetch(input, init);
    },
  });

  let generateError: unknown;
  let generatedText = '';

  try {
    generatedText = (
      await generateText({
        model: bedrock(liveModelId),
        prompt: 'Say hello',
        maxOutputTokens: 10,
      })
    ).text;
  } catch (error) {
    generateError = error;
  }

  const streamResult = streamText({
    model: bedrock(liveModelId),
    prompt: 'Say hello',
    maxOutputTokens: 10,
  });
  const [streamedText, streamFinishReason] = await Promise.all([
    streamResult.text,
    streamResult.finishReason,
  ]);

  const generateFailureObserved =
    APICallError.isInstance(generateError) &&
    generateError.message === 'Invalid JSON response' &&
    generateError.statusCode === 200 &&
    generateError.responseBody?.includes('UnknownOperationException') === true;
  const streamFailureObserved =
    streamedText === '' && streamFinishReason === 'other';

  if (generateFailureObserved && streamFailureObserved) {
    throw new Error(
      'ISSUE_17523_REPRODUCED: generateText received HTTP 200 UnknownOperationException as Invalid JSON response; streamText returned empty text with finish reason other',
    );
  }

  if (generateError != null) {
    throw generateError;
  }

  if (generatedText === '' || streamedText === '') {
    throw new Error(
      'Bedrock ARN invocation completed without the reported error but returned empty assistant text',
    );
  }

  if (
    requestedUrls.length !== 2 ||
    requestedUrls.some(url => !url.includes('%2F'))
  ) {
    throw new Error('SDK requests did not retain encoded ARN slashes');
  }

  console.log(
    JSON.stringify(
      {
        applicationProfileRouting,
        foundationModelRouting,
        sdk: {
          generatedText,
          streamedText,
          streamFinishReason,
          requestedUrls,
        },
      },
      null,
      2,
    ),
  );
}

main();
