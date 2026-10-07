import { mistral } from '@ai-sdk/mistral';
import { streamText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const model = mistral.conversation('mistral-medium-latest');
  const tools = {
    // Replace with mistral.tools.webSearchPremium() to test premium search.
    web_search: mistral.tools.webSearch(),
  };
  const messages: ModelMessage[] = [];
  const prompts = [
    'Use web search to find the latest on Cristiano Ronaldo.',
    'What about the lastest on Lionel Messi? Use web search to find official announcements.',
  ];

  for (const [index, prompt] of prompts.entries()) {
    messages.push({ role: 'user', content: prompt });

    console.log(`\nTurn ${index + 1}: ${prompt}`);
    const result = streamText({ model, tools, messages });

    await printFullStream({ result });
    print('Sources:', await result.sources);
    print('Usage:', await result.usage);
    console.log('Finish reason:', await result.finishReason);

    // Replay the complete response after the stream has finished.
    messages.push(...(await result.responseMessages));
  }
});
