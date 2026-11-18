import { mistral } from '@ai-sdk/mistral';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = mistral.conversation('mistral-medium-latest');
  const tools = {
    web_search: mistral.tools.webSearch(),
  };
  const messages: ModelMessage[] = [];
  const prompts = [
    'Use web search to find the latest on Cristiano Ronaldo.',
    'What about the lastest on Lionel Messi? Use web search to find official announcements.',
  ];

  for (const [index, prompt] of prompts.entries()) {
    messages.push({ role: 'user', content: prompt });

    const result = await generateText({ model, tools, messages });

    console.log(`\nTurn ${index + 1}: ${prompt}`);
    console.log(result.text);
    print('Tool calls:', result.toolCalls);
    print('Tool results:', result.toolResults, { depth: 1 });
    print('Sources:', result.sources);
    print('Usage:', result.usage);
    console.log('Finish reason:', result.finishReason);

    // Replay the complete response, including provider-executed search tools.
    messages.push(...result.responseMessages);
  }
});
