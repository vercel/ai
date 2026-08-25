import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { streamText } from 'ai';
import fs from 'node:fs';

const codec = new EventStreamCodec(toUtf8, fromUtf8);
const modelIds = [
  'us.openai.gpt-5.6-luna',
  'global.openai.gpt-5.6-luna',
] as const;
const primaryFailureSignal =
  'Issue #19403 reproduced: CRIS OpenAI reasoning request failed because AI SDK sent reasoningConfig instead of reasoning.effort';

const liveReasoningConfigError = fs.readFileSync(
  new URL(
    '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-openai-cris-reasoning-config-error.json',
    import.meta.url,
  ),
  'utf8',
);

function createEvent(eventType: string, value: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(JSON.stringify(value)),
  });
}

function createSuccessfulStream(): ReadableStream<Uint8Array> {
  const chunks = [
    createEvent('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { text: 'OK' },
    }),
    createEvent('contentBlockStop', { contentBlockIndex: 0 }),
    createEvent('messageStop', { stopReason: 'end_turn' }),
  ];

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function main() {
  let reproduced = false;

  for (const modelId of modelIds) {
    let observedWrongRequest = false;
    let observedUnexpectedRequest = false;
    let requestBody: any;

    const provider = createAmazonBedrock({
      apiKey: 'reproduction-api-key',
      region: 'us-west-2',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        const additionalFields = requestBody.additionalModelRequestFields;

        if (
          additionalFields?.reasoning?.effort === 'high' &&
          additionalFields?.reasoningConfig == null &&
          additionalFields?.reasoning_effort == null
        ) {
          return new Response(createSuccessfulStream(), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          });
        }

        if (
          additionalFields?.reasoningConfig?.maxReasoningEffort === 'high' &&
          additionalFields?.reasoning == null &&
          additionalFields?.reasoning_effort == null
        ) {
          observedWrongRequest = true;
          return new Response(liveReasoningConfigError, {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }

        observedUnexpectedRequest = true;
        return new Response(
          JSON.stringify({ message: 'Unexpected reproduction request shape' }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    });

    const result = streamText({
      model: provider(modelId),
      prompt: 'Reply with OK.',
      maxOutputTokens: 64,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            maxReasoningEffort: 'high',
          },
        },
      },
      onError: () => {},
    });

    let text = '';
    let streamError: unknown;

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
      } else if (part.type === 'error') {
        streamError = part.error;
      }
    }

    const errorMessage =
      streamError instanceof Error ? streamError.message : String(streamError);

    if (
      observedWrongRequest &&
      text === '' &&
      errorMessage.includes("Unknown parameter: 'reasoningConfig'")
    ) {
      reproduced = true;
      continue;
    }

    if (
      !observedUnexpectedRequest &&
      !observedWrongRequest &&
      streamError == null &&
      text === 'OK' &&
      requestBody.additionalModelRequestFields?.reasoning?.effort === 'high'
    ) {
      continue;
    }

    console.error(
      `Reproduction harness failed for ${modelId}: ${JSON.stringify({
        requestBody,
        text,
        errorMessage,
      })}`,
    );
    process.exit(2);
  }

  if (reproduced) {
    console.error(primaryFailureSignal);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Reproduction harness failed:', error);
  process.exit(2);
});
