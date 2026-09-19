import { quiverai, type QuiverAILanguageModelOptions } from '@ai-sdk/quiverai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const stagedFiles = new Map<string, string>();

  const result = await generateText({
    model: quiverai('arrow-2'),
    prompt:
      'Create a minimal blue compass icon and stage it as compass.svg. Refine it if needed, then explain the final design.',
    tools: {
      write_file: tool({
        description:
          'Stage SVG source in the calling application. Only SVG files are accepted.',
        inputSchema: z.object({
          path: z.string().regex(/^[a-z0-9-]+\.svg$/),
          content: z.string().startsWith('<svg'),
        }),
        execute: async ({ path, content }) => {
          stagedFiles.set(path, content);
          return { path, staged: true };
        },
      }),
    },
    providerOptions: {
      quiverai: {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
      } satisfies QuiverAILanguageModelOptions,
    },
    // Bound the caller-executed loop because every step is another request.
    stopWhen: isStepCount(4),
  });

  console.log(result.text);
  console.log({
    steps: result.steps.length,
    stagedFiles: [...stagedFiles.keys()],
    usage: result.totalUsage,
  });
});
