import { subquadratic } from '@ai-sdk/subquadratic';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: subquadratic('subq-savant-1.4'),
    reasoning: 'low',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in one sentence.' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: readFileSync('./data/comic-cat.png'),
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
});
