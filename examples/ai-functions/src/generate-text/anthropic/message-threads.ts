import { anthropic } from '@ai-sdk/anthropic';
import { APICallError, generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const model = anthropic('claude-sonnet-4-6');
  const system = 'Keep your answers brief.';
  const firstMessage: ModelMessage = {
    role: 'user',
    content: 'Remember that my favorite color is cobalt blue.',
  };
  const first = await generateText({
    model,
    maxOutputTokens: 128,
    system,
    messages: [firstMessage],
    providerOptions: { anthropic: { thread: { type: 'create' } } },
  });

  // Keep the full history locally: threads expire and are best-effort.
  const nextMessage: ModelMessage = {
    role: 'user',
    content: 'What is my favorite color?',
  };
  const history: ModelMessage[] = [
    firstMessage,
    ...first.response.messages,
    nextMessage,
  ];
  const previousMessageId = first.response.id;
  if (previousMessageId == null) {
    throw new Error('The create response did not include a message ID.');
  }

  try {
    const second = await generateText({
      model,
      maxOutputTokens: 128,
      include: { responseBody: true },
      // Only new messages. System and tools are retained by the server.
      messages: [nextMessage],
      providerOptions: {
        anthropic: { thread: { type: 'continue', previousMessageId } },
      },
    });
    console.log(second.text);
    return second;
  } catch (error) {
    if (!APICallError.isInstance(error)) throw error;
    const data = error.data as
      | {
          error?: { details?: { error_code?: string } };
        }
      | undefined;
    const code = data?.error?.details?.error_code;
    if (
      code !== 'thread_not_found' &&
      code !== 'thread_already_continued' &&
      code !== 'thread_continue_in_flight'
    ) {
      throw error;
    }

    // Replay once, including system and tools, to start a fresh thread.
    const replay = await generateText({
      model,
      maxOutputTokens: 128,
      include: { responseBody: true },
      system,
      messages: history,
      providerOptions: { anthropic: { thread: { type: 'create' } } },
    });
    console.log(replay.text);
    return replay;
  }
});
