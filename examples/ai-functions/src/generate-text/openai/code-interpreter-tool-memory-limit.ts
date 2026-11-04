import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';
import {
  retrieveOpenAIContainer,
  deleteOpenAIContainer,
} from '../../lib/retrieve-openai-container';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5.4-nano'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter({
        container: {
          memoryLimit: '4g',
        },
      }),
    },
    toolChoice: 'required',
    prompt:
      'Simulate rolling two dice 10000 times, return the sum of all the results, and upload the result to a file.',
  });

  const codeInterpreter = result.staticToolCalls.find(
    call => call.toolName === 'code_interpreter',
  );
  if (!codeInterpreter) {
    console.log('container failed');
    return;
  }
  const {
    input: { containerId },
  } = codeInterpreter;
  console.log(`containerId: ${containerId}`);

  try {
    const container = await retrieveOpenAIContainer(containerId);
    console.log('container memory_limit:', container.memory_limit);
  } finally {
    await deleteOpenAIContainer(containerId);
  }
});
