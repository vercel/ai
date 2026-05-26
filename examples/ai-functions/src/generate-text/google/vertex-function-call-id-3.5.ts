import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText, isStepCount, type ModelMessage } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

/*
 * Tool-call round-trip on Vertex AI with gemini-3.5-flash. Mirrors the Gemini
 * API example. Gemini 3 emits an `id` on each `functionCall` part; the
 * matching `functionResponse` parts we send back in turn 2 should carry the
 * same `id` so the model can correlate parallel calls.
 */
run(async () => {
  const messages: Array<ModelMessage> = [
    {
      role: 'user',
      content:
        'In parallel, get the weather for San Francisco, London, and Tokyo. ' +
        'Call the weather tool three times, one per city.',
    },
  ];

  const turn1 = await generateText({
    model: googleVertex('gemini-3.5-flash'),
    tools: { weather: weatherTool },
    messages,
    stopWhen: isStepCount(1),
  });

  console.log('Turn 1 tool call IDs:');
  for (const call of turn1.toolCalls) {
    console.log(`  - ${call.toolCallId} (${call.toolName})`);
  }

  messages.push(...turn1.finalStep.response.messages);
  messages.push({
    role: 'user',
    content:
      'Now summarize those three results in a single sentence, sorted from ' +
      'coldest to warmest.',
  });

  const turn2 = await generateText({
    model: googleVertex('gemini-3-flash-preview'),
    tools: { weather: weatherTool },
    messages,
  });

  console.log('\nTurn 2 text:', turn2.text);
});
