import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

const skillZip = readFileSync('data/island-rescue-skill.zip').toString(
  'base64',
);

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.4-mini'),
    tools: {
      shell: azure.tools.shell({
        environment: {
          type: 'containerAuto',
          skills: [
            {
              type: 'inline',
              name: 'island-rescue',
              description: 'How to be rescued from a lonely island',
              source: {
                type: 'base64',
                mediaType: 'application/zip',
                data: skillZip,
              },
            },
          ],
        },
      }),
    },
    prompt:
      'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
  });

  console.log('Result:', result.text);
});
