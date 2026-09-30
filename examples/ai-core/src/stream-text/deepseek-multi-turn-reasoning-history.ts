import { deepseek } from '@ai-sdk/deepseek';
import { stepCountIs, streamText, type ModelMessage } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

// Multi-turn tool use on the `deepseek-flash` alias (V4.1 Flash). DeepSeek V4
// accepts `reasoning_content` on replayed assistant turns from earlier rounds
// and counts it toward the prompt. Before the provider recognized
// `deepseek-flash` as V4 it applied the R1 rule and silently stripped that
// history, so the model lost its prior reasoning.
//
// The check replays the same history twice with a one-token budget, once with
// the real reasoning and once with the reasoning blanked, and compares
// inputTokens. Equal counts mean the reasoning never reached the model.
run(async () => {
  const model = deepseek('deepseek-flash');
  const tools = { weather: weatherTool };
  const opening = 'What is the weather in San Francisco?';

  console.log('=== TURN 1 (tool call + answer) ===');
  const turn1 = streamText({
    model,
    tools,
    stopWhen: stepCountIs(2),
    prompt: opening,
  });
  await printFullStream({ result: turn1 });

  const history: ModelMessage[] = [
    { role: 'user', content: opening },
    ...(await turn1.response).messages,
    { role: 'user', content: 'How about in New York?' },
  ];

  console.log('\n=== TURN 2 (replay history + new user turn) ===');
  const withReasoning = await inputTokens(history);
  const withBlankReasoning = await inputTokens(history.map(blankReasoning));
  console.log(`inputTokens with prior reasoning:    ${withReasoning}`);
  console.log(`inputTokens with reasoning blanked:  ${withBlankReasoning}`);

  if (
    withReasoning === undefined ||
    withBlankReasoning === undefined ||
    withReasoning <= withBlankReasoning
  ) {
    throw new Error(
      'FAIL: prior-turn reasoning_content did not reach DeepSeek',
    );
  }
  console.log(
    `PASS: prior-turn reasoning_content reached DeepSeek (+${
      withReasoning - withBlankReasoning
    } tokens)`,
  );

  async function inputTokens(messages: ModelMessage[]) {
    const result = streamText({ model, tools, messages, maxOutputTokens: 1 });
    await result.consumeStream();
    return (await result.usage).inputTokens;
  }
});

function blankReasoning(message: ModelMessage): ModelMessage {
  if (message.role !== 'assistant' || typeof message.content === 'string') {
    return message;
  }
  return {
    ...message,
    content: message.content.map(part =>
      part.type === 'reasoning' ? { ...part, text: '' } : part,
    ),
  };
}
