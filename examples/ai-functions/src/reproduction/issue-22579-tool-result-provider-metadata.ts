import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import {
  convertToModelMessages,
  readUIMessageStream,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const callMetadata = { example: { phase: 'call' } };
const resultMetadata = { example: { phase: 'result' } };
const failureSignal =
  'ISSUE #22579: convertToModelMessages replaced application tool result metadata with call metadata';

function getToolCallProviderOptions(messages: ModelMessage[]) {
  const assistantMessage = messages.find(
    message => message.role === 'assistant',
  );
  assert.ok(assistantMessage, 'Expected an assistant model message');
  assert.ok(Array.isArray(assistantMessage.content));

  const toolCall = assistantMessage.content.find(
    part => part.type === 'tool-call',
  );
  assert.ok(toolCall, 'Expected a tool-call model message part');
  return toolCall.providerOptions;
}

function getToolResultProviderOptions(messages: ModelMessage[]) {
  const toolMessage = messages.find(message => message.role === 'tool');
  assert.ok(toolMessage, 'Expected a tool model message');

  const toolResult = toolMessage.content.find(
    part => part.type === 'tool-result',
  );
  assert.ok(toolResult, 'Expected a tool-result model message part');
  return toolResult.providerOptions;
}

async function convertApplicationToolPart(
  part: UIMessage['parts'][number],
): Promise<ModelMessage[]> {
  return convertToModelMessages([
    {
      role: 'assistant',
      parts: [part],
    },
  ]);
}

async function main() {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'message-1' },
    {
      type: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: 'lookup',
      input: {},
      providerMetadata: callMetadata,
    },
    {
      type: 'tool-output-available',
      toolCallId: 'call-1',
      output: 'ok',
      providerMetadata: resultMetadata,
    },
    { type: 'finish', finishReason: 'stop' },
  ];

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  let streamedMessage: UIMessage | undefined;
  for await (const update of readUIMessageStream({ stream })) {
    streamedMessage = update;
  }

  assert.ok(streamedMessage, 'Expected readUIMessageStream to emit a message');
  const streamedToolPart = streamedMessage.parts[0];
  assert.ok(
    'callProviderMetadata' in streamedToolPart &&
      'resultProviderMetadata' in streamedToolPart,
    'Expected the stream to preserve a tool part',
  );
  assert.deepEqual(streamedToolPart.callProviderMetadata, callMetadata);
  assert.deepEqual(streamedToolPart.resultProviderMetadata, resultMetadata);

  const roundTripMessages = await convertToModelMessages([streamedMessage]);
  assert.deepEqual(
    getToolCallProviderOptions(roundTripMessages),
    callMetadata,
    'Expected the tool call to retain call metadata',
  );

  const scenarios = [
    {
      name: 'static output-available stream round trip',
      actual: getToolResultProviderOptions(roundTripMessages),
      expected: resultMetadata,
    },
    {
      name: 'static output-error',
      actual: getToolResultProviderOptions(
        await convertApplicationToolPart({
          type: 'tool-lookup',
          state: 'output-error',
          toolCallId: 'call-2',
          input: {},
          errorText: 'failed',
          callProviderMetadata: callMetadata,
          resultProviderMetadata: resultMetadata,
        }),
      ),
      expected: resultMetadata,
    },
    {
      name: 'dynamic output-available',
      actual: getToolResultProviderOptions(
        await convertApplicationToolPart({
          type: 'dynamic-tool',
          toolName: 'lookup',
          state: 'output-available',
          toolCallId: 'call-3',
          input: {},
          output: 'ok',
          callProviderMetadata: callMetadata,
          resultProviderMetadata: resultMetadata,
        }),
      ),
      expected: resultMetadata,
    },
    {
      name: 'dynamic output-error',
      actual: getToolResultProviderOptions(
        await convertApplicationToolPart({
          type: 'dynamic-tool',
          toolName: 'lookup',
          state: 'output-error',
          toolCallId: 'call-4',
          input: {},
          errorText: 'failed',
          callProviderMetadata: callMetadata,
          resultProviderMetadata: resultMetadata,
        }),
      ),
      expected: resultMetadata,
    },
    {
      name: 'call metadata fallback when result metadata is absent',
      actual: getToolResultProviderOptions(
        await convertApplicationToolPart({
          type: 'tool-lookup',
          state: 'output-available',
          toolCallId: 'call-5',
          input: {},
          output: 'ok',
          callProviderMetadata: callMetadata,
        }),
      ),
      expected: callMetadata,
    },
  ];

  const mismatches = scenarios.filter(
    scenario => !isDeepStrictEqual(scenario.actual, scenario.expected),
  );

  for (const mismatch of mismatches) {
    console.error(
      `${mismatch.name}: expected ${JSON.stringify(mismatch.expected)}, received ${JSON.stringify(mismatch.actual)}`,
    );
  }

  assert.equal(mismatches.length, 0, failureSignal);
}

main();
