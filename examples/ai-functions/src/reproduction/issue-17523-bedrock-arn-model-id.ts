import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError } from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';

const modelId =
  'arn:aws:bedrock:eu-west-1:474668406012:inference-profile/eu.amazon.nova-lite-v1:0';

async function hasReportedRoutingBehavior(modelId: string) {
  const baseUrl = 'https://bedrock-runtime.eu-west-1.amazonaws.com/model';
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

  return (
    encodedResponse.status === 403 &&
    encodedBody.includes('Authorization header is missing') &&
    unencodedResponse.status === 200 &&
    unencodedBody.includes('UnknownOperationException')
  );
}

async function main() {
  const [applicationProfileRoutingFailure, foundationModelRoutingFailure] =
    await Promise.all([
      hasReportedRoutingBehavior(
        'arn:aws:bedrock:eu-west-1:123456789012:application-inference-profile/abcdefghijkl',
      ),
      hasReportedRoutingBehavior(
        'arn:aws:bedrock:eu-west-1::foundation-model/amazon.nova-lite-v1:0',
      ),
    ]);

  if (!applicationProfileRoutingFailure || !foundationModelRoutingFailure) {
    throw new Error('Bedrock routing comparison did not match issue #17523');
  }

  const bedrock = createAmazonBedrock({ region: 'eu-west-1' });

  let generateFailureObserved = false;

  try {
    await generateText({
      model: bedrock(modelId),
      prompt: 'Say hello',
      maxOutputTokens: 10,
    });
  } catch (error) {
    generateFailureObserved =
      APICallError.isInstance(error) &&
      error.message === 'Invalid JSON response' &&
      error.statusCode === 200 &&
      error.responseBody?.includes('UnknownOperationException') === true;

    if (!generateFailureObserved) {
      throw error;
    }
  }

  const streamResult = streamText({
    model: bedrock(modelId),
    prompt: 'Say hello',
    maxOutputTokens: 10,
  });
  const [streamedText, streamFinishReason] = await Promise.all([
    streamResult.text,
    streamResult.finishReason,
  ]);

  const streamFailureObserved =
    streamedText === '' && streamFinishReason === 'other';

  if (generateFailureObserved && streamFailureObserved) {
    throw new Error(
      'ISSUE_17523_REPRODUCED: generateText received HTTP 200 UnknownOperationException as Invalid JSON response; streamText returned empty text with finish reason other',
    );
  }

  console.log({
    generateFailureObserved,
    streamedText,
    streamFinishReason,
  });
}

main();
