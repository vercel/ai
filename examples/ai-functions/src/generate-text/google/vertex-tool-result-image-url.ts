import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const imageUrl =
  'https://raw.githubusercontent.com/vercel/ai/b3b56246cbbe191fdb73005daa68e8c54d282aa3/examples/ai-functions/data/comic-cat.png';

run(async () => {
  const getCatImage = tool({
    description: 'Return the requested preview image.',
    inputSchema: z.object({}),
    execute: async () => ({ imageUrl }),
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: [
        {
          type: 'text',
          text: 'Here is the requested preview image.',
        },
        {
          type: 'file',
          mediaType: 'image',
          data: { type: 'url', url: new URL(output.imageUrl) },
        },
      ],
    }),
  });

  // Reproduction for https://github.com/vercel/ai/issues/15671:
  // before the Vertex fix, the remote file is sent back as URL-shaped content
  // rather than image bytes, so the model cannot inspect the tool result.
  const result = await generateText({
    model: googleVertex('gemini-2.5-flash'),
    tools: { get_cat_image: getCatImage },
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) => ({
      toolChoice:
        stepNumber === 0 ? { type: 'tool', toolName: 'get_cat_image' } : 'none',
    }),
    prompt:
      'Use get_cat_image exactly once, then describe the image it returned in one sentence.',
  });

  console.log(result.text);
});
