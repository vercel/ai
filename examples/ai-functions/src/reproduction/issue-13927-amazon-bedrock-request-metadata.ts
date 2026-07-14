import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, streamText } from 'ai';

const modelId = 'us.anthropic.claude-opus-4-6-v1';

async function main() {
  const bedrock = createAmazonBedrock({ region: 'us-east-1' });

  const generateResult = await generateText({
    model: bedrock(modelId),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 8,
  });

  let streamFinishRequest: { body?: unknown } | undefined;
  const streamResult = streamText({
    model: bedrock(modelId),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 8,
    onFinish: result => {
      streamFinishRequest = result.request;
    },
  });
  await streamResult.consumeStream();

  const observations = {
    generateText: {
      text: generateResult.text,
      request: generateResult.request,
    },
    streamText: {
      text: await streamResult.text,
      request: streamFinishRequest,
    },
  };

  console.log(JSON.stringify(observations, null, 2));

  const failures = [
    generateResult.request.body == null
      ? 'generateText result is missing request.body from doGenerate()'
      : undefined,
    streamFinishRequest?.body == null
      ? 'streamText onFinish result is missing request.body from doStream()'
      : undefined,
  ].filter((failure): failure is string => failure != null);

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
