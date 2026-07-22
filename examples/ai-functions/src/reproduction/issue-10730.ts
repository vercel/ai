import { createGateway } from '../../../ai-core/node_modules/@ai-sdk/gateway';
import {
  generateObject,
  NoObjectGeneratedError,
} from '../../../ai-core/node_modules/ai';
import { z } from '../../../ai-core/node_modules/zod';

const reportedModel = 'deepseek/deepseek-v3.2-exp';
const currentModel = 'deepseek/deepseek-v3.2';

const simpleSchema = z.object({
  playerName: z
    .string()
    .describe('A short, creative name for your game character (1-3 words max)'),
});

const complexSchema = z.object({
  playerName: z.string().describe('A short, creative character name'),
  characterClass: z.enum(['warrior', 'mage', 'rogue']),
  level: z.number().int().min(1).max(20),
  traits: z.array(z.string()).min(3).max(5),
  stats: z.object({
    strength: z.number().int().min(1).max(20),
    agility: z.number().int().min(1).max(20),
    intelligence: z.number().int().min(1).max(20),
  }),
  backstory: z.string().describe('A two-sentence backstory'),
});

async function assertValidObjects({
  attempts,
  label,
  prompt,
  schema,
}: {
  attempts: number;
  label: string;
  prompt: string;
  schema: typeof simpleSchema | typeof complexSchema;
}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await generateObject({
        model: currentModel,
        schema,
        prompt,
        maxRetries: 0,
      });
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error(
          `${label} failed on attempt ${attempt} with AI_NoObjectGeneratedError: ${error.text}`,
        );
      }

      throw error;
    }
  }

  console.log(`${label}: ${attempts}/${attempts} valid objects`);
}

async function main() {
  const availableModels = await createGateway().getAvailableModels();
  const modelIds = availableModels.models.map(model => model.id);

  console.log(
    `reported model available: ${modelIds.includes(reportedModel as never)}`,
  );
  console.log(
    `current successor available: ${modelIds.includes(currentModel)}`,
  );

  await assertValidObjects({
    attempts: 20,
    label: 'reported simple schema',
    schema: simpleSchema,
    prompt: 'Generate a short, creative name for a video game character',
  });

  await assertValidObjects({
    attempts: 40,
    label: 'representative complex schema',
    schema: complexSchema,
    prompt: 'Generate a creative video game character',
  });

  await assertValidObjects({
    attempts: 40,
    label: 'DeepSeek-documented JSON prompt',
    schema: complexSchema,
    prompt: `Generate a creative video game character as JSON.
Example JSON:
{
  "playerName": "Nyx Vale",
  "characterClass": "rogue",
  "level": 7,
  "traits": ["resourceful", "wary", "loyal"],
  "stats": { "strength": 9, "agility": 17, "intelligence": 14 },
  "backstory": "Nyx grew up mapping forgotten tunnels. They now guide travelers through dangerous ruins."
}`,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
