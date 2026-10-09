import { google } from '@ai-sdk/google';
import { isStepCount, streamText, type ModelMessage } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

type GoogleInteractionsModelId = Parameters<typeof google.interactions>[0];

/*
 * Same scenario as `function-call-id.ts` but routed through the Gemini
 * Interactions API instead of the native Gemini API. Exercises parallel
 * function calling and the tool-result round-trip for both pre-Gemini-3 and
 * Gemini 3 models.
 */
async function exerciseRoundTrip({
  turn1Model,
  turn2Model,
}: {
  turn1Model: GoogleInteractionsModelId;
  turn2Model: GoogleInteractionsModelId;
}) {
  const messages: Array<ModelMessage> = [
    {
      role: 'user',
      content:
        'In parallel, get the weather for San Francisco, London, and Tokyo. ' +
        'Call the weather tool three times, one per city.',
    },
  ];

  const turn1 = streamText({
    model: google.interactions(turn1Model),
    tools: { weather: weatherTool },
    messages,
    stopWhen: isStepCount(1),
  });

  for await (const part of turn1.fullStream) {
    if (part.type === 'tool-call') {
      console.log(
        `Turn 1 tool call (${turn1Model}) (${part.toolCallId}): ${part.toolName}`,
        JSON.stringify(part.input),
      );
    } else if (part.type === 'tool-result') {
      console.log(
        `Turn 1 tool result (${turn1Model}) (${part.toolCallId}):`,
        JSON.stringify(part.output),
      );
    }
  }

  messages.push(...(await turn1.finalStep).response.messages);
  messages.push({
    role: 'user',
    content:
      'Now summarize those three results in a single sentence, sorted from ' +
      'coldest to warmest.',
  });

  const turn2 = streamText({
    model: google.interactions(turn2Model),
    tools: { weather: weatherTool },
    messages,
  });

  console.log(`\nTurn 2 text (${turn2Model}):`);
  for await (const part of turn2.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
  console.log();
}

run(async () => {
  console.log('--- gemini-2.5-flash ---');
  await exerciseRoundTrip({
    turn1Model: 'gemini-2.5-flash',
    turn2Model: 'gemini-2.5-flash',
  });

  console.log('\n--- gemini-3.5-flash ---');
  await exerciseRoundTrip({
    turn1Model: 'gemini-3.5-flash',
    turn2Model: 'gemini-3-flash-preview',
  });
});
