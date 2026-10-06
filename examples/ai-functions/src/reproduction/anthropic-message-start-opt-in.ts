import { createAnthropic } from '@ai-sdk/anthropic';
import { readUIMessageStream, streamText } from 'ai';
import { readFile } from 'node:fs/promises';

const messageStartKind = 'anthropic.message_start';

async function main() {
  const fixture = await readFile(
    new URL(
      '../../../../packages/anthropic/src/__fixtures__/anthropic-message-start-default.chunks.txt',
      import.meta.url,
    ),
    'utf8',
  );

  const anthropic = createAnthropic({
    apiKey: 'test',
    fetch: async () =>
      new Response(
        fixture
          .trim()
          .split('\n')
          .map(line => `data: ${line}\n\n`)
          .join(''),
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
  });

  // No provider options are set, so message-start metadata should remain opt-in.
  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    prompt: 'Say hi.',
  });

  let message;
  for await (const currentMessage of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    message = currentMessage;
  }

  if (message == null) {
    throw new Error('Expected a UIMessage');
  }

  const stepContent = await result.content;
  const stepHasMessageStart = stepContent.some(
    part => part.type === 'custom' && part.kind === messageStartKind,
  );
  const uiMessageHasMessageStart = message.parts.some(
    part => part.type === 'custom' && part.kind === messageStartKind,
  );

  console.log(
    'step content:',
    stepContent.map(part =>
      part.type === 'custom' ? `custom(${part.kind})` : part.type,
    ),
  );
  console.log(
    'UIMessage:',
    message.parts.map(part =>
      part.type === 'custom' ? `custom(${part.kind})` : part.type,
    ),
  );

  if (stepHasMessageStart && uiMessageHasMessageStart) {
    throw new Error(
      'Issue #22133 reproduced: anthropic.message_start was emitted without opt-in in step content and UIMessage',
    );
  }

  if (stepHasMessageStart || uiMessageHasMessageStart) {
    throw new Error(
      'anthropic.message_start was emitted without opt-in in one output surface',
    );
  }
}

main();
