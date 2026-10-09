import { createOpenAI } from '@ai-sdk/openai';
import {
  streamText,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { readFile } from 'node:fs/promises';
import { Chat } from '../../../../packages/vue/dist/index.js';

const expectedInput =
  '<main><h1>Streaming custom tool input</h1><p>This must arrive progressively.</p></main>';
const fixtureUrl = new URL(
  '../../../../packages/openai/src/responses/__fixtures__/openai-custom-text-tool.1.chunks.txt',
  import.meta.url,
);

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  const fixture = await readFile(fixtureUrl, 'utf8');
  const responseBody = `${fixture
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`)
    .join('')}data: [DONE]\n\n`;

  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(responseBody, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  let streamController:
    | ReadableStreamDefaultController<UIMessageChunk>
    | undefined;
  let providerChunks: UIMessageChunk[] | undefined;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      const result = streamText({
        model: openai.responses('gpt-5.2-codex'),
        tools: {
          setHtml: openai.tools.customTool({
            name: 'setHtml',
            description: 'Return the requested HTML verbatim as freeform text.',
            format: { type: 'text' },
          }),
        },
        toolChoice: 'required',
        prompt: 'Render HTML.',
      });

      providerChunks = [];
      for await (const chunk of result.toUIMessageStream()) {
        providerChunks.push(chunk);
      }

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          streamController = controller;
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new Chat({ transport });
  const sendPromise = chat.sendMessage({ text: 'Render HTML.' });

  await waitFor(
    () => streamController != null && providerChunks != null,
    'the fixture-backed OpenAI response stream',
  );

  const inputDeltas = providerChunks!.filter(
    (chunk): chunk is Extract<UIMessageChunk, { type: 'tool-input-delta' }> =>
      chunk.type === 'tool-input-delta',
  );
  if (
    inputDeltas.length < 2 ||
    inputDeltas.map(chunk => chunk.inputTextDelta).join('') !== expectedInput
  ) {
    throw new Error(
      'Fixture precondition failed: OpenAI custom-tool input did not stream progressively.',
    );
  }

  function getAssistantMessage() {
    return chat.messages.at(-1)?.role === 'assistant'
      ? chat.messages.at(-1)
      : undefined;
  }

  function getToolPart() {
    return getAssistantMessage()?.parts.find(
      part => part.type === 'tool-setHtml',
    ) as { input?: unknown; state: string } | undefined;
  }

  async function writeAndWait(chunk: UIMessageChunk) {
    const previousAssistantMessage = getAssistantMessage();
    streamController!.enqueue(chunk);

    if (
      chunk.type === 'tool-input-start' ||
      chunk.type === 'tool-input-delta' ||
      chunk.type === 'tool-input-available'
    ) {
      await waitFor(
        () => getAssistantMessage() !== previousAssistantMessage,
        `Chat to process ${chunk.type}`,
      );
    }
  }

  const streamingSnapshots: Array<{
    accumulatedInput: string;
    displayedInput: unknown;
  }> = [];
  let accumulatedInput = '';

  for (const chunk of providerChunks!) {
    await writeAndWait(chunk);

    if (chunk.type === 'tool-input-delta') {
      accumulatedInput += chunk.inputTextDelta;
      const displayedInput = getToolPart()?.input;
      streamingSnapshots.push({
        accumulatedInput,
        displayedInput:
          displayedInput === undefined ? '<undefined>' : displayedInput,
      });
    }
  }

  streamController!.close();
  await sendPromise;

  const finalInput = getToolPart()?.input;
  if (finalInput !== expectedInput) {
    throw new Error(
      `Fixture precondition failed: final tool input was ${JSON.stringify(finalInput)}.`,
    );
  }

  const progressivelyUpdated = streamingSnapshots.every(
    snapshot => snapshot.displayedInput === snapshot.accumulatedInput,
  );

  if (!progressivelyUpdated) {
    console.error(
      'ISSUE #13021 REPRODUCED: @ai-sdk/vue Chat did not expose accumulated freeform tool input during input-streaming',
    );
    console.error(
      JSON.stringify({
        streamingSnapshots,
        finalInput,
      }),
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
