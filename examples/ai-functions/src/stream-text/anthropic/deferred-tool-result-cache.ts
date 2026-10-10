import {
  anthropic,
  forwardAnthropicContainerIdFromLastStep,
} from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  isStepCount,
  readUIMessageStream,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { mkdtemp, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deferred-tool-cache-'));
  const notesPath = join(directory, 'notes.txt');
  // A large tool result makes losing the cached prefix easy to observe.
  await writeFile(
    notesPath,
    Array.from(
      { length: 200 },
      (_, index) =>
        `Note ${index + 1}: The sample garden has rosemary, thyme, and mint. Water each bed in the morning and record the harvest in the weekly journal.`,
    ).join('\n'),
  );

  try {
    const model = anthropic('claude-sonnet-5-5');
    const tools = {
      program: anthropic.tools.codeExecution_20250825(),
      readNotes: tool({
        description: 'Read the current notes.',
        inputSchema: z.object({}),
        execute: async () => readFile(notesPath, 'utf8'),
        providerOptions: {
          anthropic: { allowedCallers: ['direct'] },
        },
      }),
      addNote: tool({
        description: 'Append a new note to the notes file.',
        inputSchema: z.object({ note: z.string() }),
        execute: async ({ note }) => {
          await appendFile(notesPath, `\n${note}\n`);
          return 'Note added.';
        },
        providerOptions: {
          anthropic: { allowedCallers: ['code_execution_20250825'] },
        },
      }),
    };
    const runId = randomUUID();
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: `Cache test ${runId}. In your first response, start a hosted program that calls addNote to add "Review prompt caching", and call readNotes directly in parallel in the same response. The program should print only "Done". Finally say only "Done". Do not quote the notes.`,
      },
    ];
    const providerOptions = {
      anthropic: { cacheControl: { type: 'ephemeral' as const } },
    };
    const result = streamText({
      model,
      tools,
      messages,
      providerOptions,
      stopWhen: isStepCount(5),
      prepareStep: forwardAnthropicContainerIdFromLastStep,
      onStepFinish: step => {
        console.log(
          'Step:',
          step.content.map(part => ({
            type: part.type,
            ...('toolCallId' in part ? { toolCallId: part.toolCallId } : {}),
          })),
        );
        console.log('Usage:', step.usage.inputTokenDetails);
      },
    });
    let assistant: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      stream: result.toUIMessageStream(),
      terminateOnError: true,
    })) {
      assistant = message;
    }
    if (assistant == null) throw new Error('No assistant message received.');
    const direct = [...messages, ...(await result.responseMessages)];
    const replay = [
      ...messages,
      ...(await convertToModelMessages([structuredClone(assistant)], {
        tools,
      })),
    ];
    console.log(
      'Result positions:',
      assistant.parts.flatMap(part =>
        'resultPosition' in part
          ? [{ toolCallId: part.toolCallId, ...part.resultPosition }]
          : [],
      ),
    );

    for (const [label, history] of [
      ['Direct', direct],
      ['Replay', replay],
    ] as const) {
      console.log(
        `${label} message order:`,
        history.map(message => ({
          role: message.role,
          parts:
            typeof message.content === 'string'
              ? ['text']
              : message.content.map(part => part.type),
        })),
      );
    }

    const followUp: ModelMessage = {
      role: 'user',
      content: 'What note did you just add? Answer briefly without tools.',
    };
    async function continueConversation(
      label: string,
      history: ModelMessage[],
    ) {
      const continuation = streamText({
        model,
        tools,
        messages: [...history, followUp],
        providerOptions,
        toolChoice: 'none',
        maxOutputTokens: 128,
      });
      await continuation.consumeStream();
      console.log(label, (await continuation.usage).inputTokenDetails);
      console.log(await continuation.text);
    }
    // Warm the ORIGINAL prefix before testing replay. Warming the replay
    // itself would hide a cache miss caused by changing that prefix.
    await continueConversation('Direct warm-up:', direct);
    await continueConversation('Direct warm control:', direct);
    await continueConversation('UI replay:', replay);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
