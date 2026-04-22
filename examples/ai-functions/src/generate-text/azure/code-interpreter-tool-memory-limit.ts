import { azure } from '@ai-sdk/azure';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';
import { retrieveAzureContainer } from '../../lib/retrieve-azure-container';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5-nano'),
    tools: {
      code_interpreter: azure.tools.codeInterpreter({
        container: {
          memoryLimit: '4g',
        },
      }),
    },
    prompt:
      'Simulate rolling two dice 10000 times and, return the sum of all the results, and upload the result to a file.',
    stopWhen: stepCountIs(5),
  });

  type CallCodeInterpreterToolCall = {
    type: 'tool-call';
    toolCallId: string;
    toolName: 'code_interpreter';
    input: {
      code: string;
      containerId: string;
    };
  };
  const codeInterpreter = result.content.find(
    content =>
      content.type === 'tool-call' && content.toolName === 'code_interpreter',
  ) as CallCodeInterpreterToolCall | undefined;
  if (!codeInterpreter) {
    console.log('container failed');
    return;
  }
  const {
    input: { containerId },
  } = codeInterpreter;
  console.log(`containerId: ${containerId}`);

  const container = await retrieveAzureContainer(containerId);
  console.log('container memory_limit:', container.memory_limit);
  console.log('container detail:', container);
});
