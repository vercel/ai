// examples/ai-core/src/stream-text/test-yielding-ui.ts
import { google } from '@ai-sdk/google';
import { isToolOrDynamicToolUIPart, readUIMessageStream, stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import z from 'zod';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-pro'),
    stopWhen: stepCountIs(3),
    tools: {
      weather: tool({
        description: 'Get the current weather with progress updates',
        inputSchema: z.object({
          location: z.string(),
        }),
        outputSchema: z.object({
          status: z.string(),
          text: z.string(),
          data: z.any().optional(),
        }),
        async *execute({ location }) {
          yield { status: 'loading', text: `Getting weather for ${location}` };
          await new Promise(resolve => setTimeout(resolve, 2000));

          yield { status: 'loading', text: `Fetching temperature data...` };
          await new Promise(resolve => setTimeout(resolve, 2000));

          yield { status: 'loading', text: `Processing data...` };
          await new Promise(resolve => setTimeout(resolve, 1000));

          return {
            status: 'success',
            text: `Weather retrieved for ${location}`,
            data: {
              location,
              temperature: 72 + Math.floor(Math.random() * 21) - 10,
              condition: 'sunny',
            },
          };
        },
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  const lastByTool: Record<
    string,
    { state?: string; yieldsLen?: number; outputKey?: string }
  > = {};

  for await (const ui of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    const toolParts = ui.parts?.filter(isToolOrDynamicToolUIPart) ?? [];
    for (const part of toolParts) {
      const id = part.toolCallId;
      const state = part.state;
      const yieldsLen =
        state === 'output-streaming'
          ? ((part as any).yields?.length ?? 0)
          : undefined;
      const outputKey =
        state === 'output-available'
          ? JSON.stringify((part as any).output)
          : undefined;

      // Only log when state changes, yields grow, or final output changes:
      const prev = lastByTool[id] || {};
      if (
        prev.state === state &&
        prev.yieldsLen === yieldsLen &&
        prev.outputKey === outputKey
      )
        continue;
      lastByTool[id] = { state, yieldsLen, outputKey };

      console.log('--- TOOL PARTS ---');
      console.log(
        JSON.stringify(
          {
            toolCallId: id,
            state,
            input: (part as any).input,
            yields: (part as any).yields, // will show your progress items
            output: (part as any).output, // final return after executeTool fix
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch(console.error);
