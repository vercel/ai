import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
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
  const result = streamText({
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

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log(
          `\x1b[32m\x1b[1mTool call:\x1b[22m ${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `\x1b[32m\x1b[1mTool result:\x1b[22m ${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
});
