import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { run } from '../../lib/run';
import {
  retrieveAzureContainer,
  deleteAzureContainer,
} from '../../lib/retrieve-azure-container';

run(async () => {
  const result = streamText({
    model: azure.responses('gpt-5-nano'),
    tools: {
      code_interpreter: azure.tools.codeInterpreter({
        container: {
          memoryLimit: '4g',
        },
      }),
    },
    toolChoice: 'required',
    prompt:
      'Simulate rolling two dice 10000 times, return the sum of all the results, and upload the result to a file.',
  });

  const codeInterpreter = (await result.staticToolCalls).find(
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
    const container = await retrieveAzureContainer(containerId);
    console.log('container memory_limit:', container.memory_limit);
  } finally {
    await deleteAzureContainer(containerId);
  }
});
