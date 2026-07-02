import { generateImage } from '../../ai/dist/index.js';
import { createTogetherAI } from '../dist/index.js';

const apiKey = process.env.TOGETHER_AI_API_KEY;

if (!apiKey) {
  console.error(
    'Missing TOGETHER_AI_API_KEY. Set it to run the live Together AI image-generation reproduction.',
  );
  process.exit(2);
}

const mode = process.argv.includes('--with-steps') ? 'with-steps' : 'exact';
const togetherai = createTogetherAI({ apiKey });

try {
  const result = await generateImage({
    model: togetherai.image('google/gemini-3-pro-image'),
    prompt: 'A serene mountain landscape',
    size: '1264x848',
    ...(mode === 'with-steps'
      ? {
          providerOptions: {
            togetherai: {
              steps: 20,
            },
          },
        }
      : {}),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        imageCount: result.images.length,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const name =
    error != null && typeof error === 'object' && 'name' in error
      ? String(error.name)
      : undefined;

  console.error(
    JSON.stringify(
      {
        ok: false,
        mode,
        name,
        message,
      },
      null,
      2,
    ),
  );

  if (
    /Unsupported use of '(seed|steps|negative_prompt)' parameter|(?:seed|steps|negative_prompt) is not supported for this model/i.test(
      message,
    )
  ) {
    process.exit(1);
  }

  process.exit(3);
}
