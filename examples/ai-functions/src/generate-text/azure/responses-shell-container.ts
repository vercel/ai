import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { run } from '../../lib/run';

/**
 * *** NOTICE ***
 *
 * This example is provided for reference only.
 * The `container` configuration is not currently supported on the Microsoft Azure platform.
 *
 * Once Azure adds support for this feature, the example will function as expected
 * and will be updated accordingly.
 */

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.2'),
    tools: {
      shell: azure.tools.shell({
        environment: {
          type: 'containerAuto',
        },
      }),
    },
    prompt:
      'Print "Hello from container!" and show the system info using uname -a',
  });

  console.log('Result:', result.text);
});
