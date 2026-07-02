import { createRequire } from 'node:module';

const requireFromAiFunctionsExample = createRequire(
  '/work/examples/ai-functions/package.json',
);

async function main() {
  if (!process.env.XAI_API_KEY) {
    console.error('XAI_API_KEY is required to run this live xAI reproduction.');
    process.exit(2);
  }

  const [{ streamText, tool }, { xai }, { z }] = await Promise.all([
    import(requireFromAiFunctionsExample.resolve('ai')),
    import(requireFromAiFunctionsExample.resolve('@ai-sdk/xai')),
    import(requireFromAiFunctionsExample.resolve('zod')),
  ]);

  const result = streamText({
    model: xai.responses('grok-4.3'),
    prompt: 'Reply OK. Do not use tools.',
    tools: {
      image_generation: tool({
        description: 'Generate image',
        inputSchema: z.object({
          prompt: z.string(),
          model: z
            .enum(['fal-ai/flux-2-pro', 'fal-ai/qwen-image-edit'])
            .optional(),
        }),
        execute: async () => ({ ok: true }),
      }),
    },
    maxOutputTokens: 8,
  });

  let sawErrorPart = false;

  try {
    for await (const part of result.fullStream) {
      console.log(JSON.stringify(part, null, 2));

      if (part.type === 'error') {
        sawErrorPart = true;
        const error = part.error as any;
        const name = error?.name ?? error?.constructor?.name;
        const message = String(error?.message ?? '');

        if (
          name === 'AI_TypeValidationError' ||
          message.includes('TypeValidationError') ||
          message.includes('Invalid value') ||
          message.includes('No matching discriminator')
        ) {
          console.error(
            'REPRODUCED issue #14932: xAI streamed error surfaced as TypeValidationError.',
          );
          process.exit(1);
        }

        if (
          error?.type === 'error' &&
          error?.message === 'Invalid arguments passed to the model.'
        ) {
          console.log(
            'Observed xAI streamed error payload without TypeValidationError.',
          );
        }
      }
    }
  } catch (error) {
    console.error(error);
    const name = (error as any)?.name ?? (error as any)?.constructor?.name;
    const message = String((error as any)?.message ?? '');

    if (
      name === 'AI_TypeValidationError' ||
      message.includes('TypeValidationError') ||
      message.includes('Invalid value') ||
      message.includes('No matching discriminator')
    ) {
      console.error(
        'REPRODUCED issue #14932: xAI streamed error surfaced as TypeValidationError.',
      );
      process.exit(1);
    }

    throw error;
  }

  if (!sawErrorPart) {
    console.log('No streamed error part was observed.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
