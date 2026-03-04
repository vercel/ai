import { streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  console.log(
    'Repro for https://github.com/vercel/ai/issues/11413#issuecomment-3787919558',
  );
  console.log(
    'Testing gateway with google/gemini-3-flash and tool calls (multi-turn)\n',
  );

  const weatherTool = tool({
    description: 'Get the weather for a location',
    inputSchema: z.object({
      location: z.string().describe('The location to get weather for'),
    }),
    execute: async ({ location }) => {
      return {
        location,
        temperature: 72,
        condition: 'sunny',
      };
    },
  });

  console.log('=== Turn 1: Initial request with tool call ===\n');

  const turn1 = streamText({
    model: 'google/gemini-3-flash',
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco?',
    maxSteps: 2,
    includeRawChunks: true,
    onStepFinish: ({ toolCalls, toolResults }) => {
      if (toolCalls) {
        console.log(`\nTool calls: ${toolCalls.length}`);
        toolCalls.forEach(call => {
          console.log(
            `  ${call.toolName} providerMetadata:`,
            JSON.stringify(call.providerMetadata, null, 2),
          );
        });
      }
      if (toolResults) {
        console.log(`Tool results: ${toolResults.length}`);
        toolResults.forEach(result => {
          console.log(
            `  ${result.toolName} providerMetadata:`,
            JSON.stringify(result.providerMetadata, null, 2),
          );
        });
      }
    },
  });

  for await (const chunk of turn1.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text);
    } else if (chunk.type === 'tool-call') {
      console.log(
        `[stream] tool-call: ${chunk.toolName}, providerMetadata:`,
        JSON.stringify(chunk.providerMetadata, null, 2),
      );
    } else if (chunk.type === 'raw') {
      const raw = chunk.rawValue as any;
      if (raw?.candidates?.[0]?.content?.parts) {
        for (const part of raw.candidates[0].content.parts) {
          if (part.functionCall) {
            console.log(
              `[raw] functionCall: ${part.functionCall.name}, thoughtSignature: ${part.thoughtSignature ? '✓' : '❌ not present'}`,
            );
          }
        }
      }
    }
  }

  const response1 = await turn1.response;
  console.log('\n\nTurn 1 complete. Checking messages for thoughtSignatures:');

  for (const msg of response1.messages) {
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      for (const part of msg.content) {
        if (part.type === 'tool-call') {
          console.log(
            `  assistant tool-call ${part.toolName} providerOptions:`,
            JSON.stringify(part.providerOptions, null, 2),
          );
        }
      }
    }
    if (msg.role === 'tool') {
      for (const part of msg.content) {
        if (part.type === 'tool-result') {
          console.log(
            `  tool-result ${part.toolName} providerOptions:`,
            JSON.stringify(part.providerOptions, null, 2),
          );
        }
      }
    }
  }

  console.log('\n=== Turn 2: Multi-turn continuation ===\n');

  try {
    const turn2 = streamText({
      model: 'google/gemini-3-flash',
      tools: { weather: weatherTool },
      messages: [
        { role: 'user', content: 'What is the weather in San Francisco?' },
        ...response1.messages,
        {
          role: 'user',
          content: 'What about New York? Use the weather tool again.',
        },
      ],
      maxSteps: 2,
      includeRawChunks: true,
      onStepFinish: ({ toolCalls, toolResults }) => {
        if (toolCalls) {
          console.log(`\nTool calls: ${toolCalls.length}`);
          toolCalls.forEach(call => {
            console.log(
              `  ${call.toolName} providerMetadata:`,
              JSON.stringify(call.providerMetadata, null, 2),
            );
          });
        }
        if (toolResults) {
          console.log(`Tool results: ${toolResults.length}`);
          toolResults.forEach(result => {
            console.log(
              `  ${result.toolName} providerMetadata:`,
              JSON.stringify(result.providerMetadata, null, 2),
            );
          });
        }
      },
    });

    for await (const chunk of turn2.fullStream) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
      }
    }

    console.log('\n\nTurn 2 succeeded!');
  } catch (error) {
    console.error('\n\nTurn 2 FAILED:');
    console.error(error);
    if (
      error instanceof Error &&
      error.message?.includes('thought_signature')
    ) {
      console.error(
        '\n>>> This is the thought_signature error from issue #11413 <<<',
      );
    }
    process.exit(1);
  }
});
