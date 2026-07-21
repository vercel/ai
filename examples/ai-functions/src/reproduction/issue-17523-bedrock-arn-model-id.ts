import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, streamText } from 'ai';

const modelId =
  'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0';

async function main() {
  const bedrock = createAmazonBedrock({ region: 'us-east-1' });
  const model = bedrock(modelId);

  let generateFailure: string | undefined;

  try {
    await generateText({
      model,
      prompt: 'Reply with hello.',
    });
  } catch (error) {
    generateFailure = error instanceof Error ? error.message : String(error);
  }

  const streamResult = streamText({
    model,
    prompt: 'Reply with hello.',
  });
  const streamedText = await streamResult.text;
  const streamFinishReason = await streamResult.finishReason;

  if (
    generateFailure === 'Invalid JSON response' &&
    streamedText === '' &&
    streamFinishReason === 'other'
  ) {
    console.error(
      'ISSUE_17523_REPRODUCED: generateText returned "Invalid JSON response"; streamText returned empty text with finish reason "other".',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify({
      generateFailure,
      streamedText,
      streamFinishReason,
    }),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
