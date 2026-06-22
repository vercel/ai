import { azure } from '@ai-sdk/azure';
import { generateText, isStepCount } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.4-mini'),
    tools: {
      shell: azure.tools.shell({
        environment: {
          type: 'containerAuto',
        },
      }),
    },
    stopWhen: isStepCount(20),
    prompt:
      'Print "Hello from container!" and show the system info using uname -a',
  });

  console.log('Result:', result.text);
});
