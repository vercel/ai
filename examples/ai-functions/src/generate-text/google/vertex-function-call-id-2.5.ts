import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText, isStepCount, type ModelMessage } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

/*
 * Tool-call round-trip on Vertex AI with gemini-2.5-flash. Mirrors the Gemini
 * API example. Pre-Gemini-3 models do not emit `id` on `functionCall`, so the
 * SDK falls back to a locally generated tool call id. This example confirms
 * whether the Vertex endpoint accepts that locally generated id on the
 * outbound `functionCall`/`functionResponse` parts in turn 2.
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
    model: googleVertex('gemini-2.5-flash'),
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
    model: googleVertex('gemini-2.5-flash'),
    tools: { weather: weatherTool },
    messages,
  });

  console.log('\nTurn 2 text:', turn2.text);
});
