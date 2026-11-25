import { tool } from 'ai';
import { z } from 'zod/v4';

export const rollDiceInputSchema = z.object({
  sides: z
    .number()
    .int()
    .min(2)
    .max(100)
    .describe(
      'Number of sides on the die. Use 6 unless another number is requested.',
    ),
});

export const rollDice = tool({
  description:
    'Roll one die and return a random result between 1 and its number of sides.',
  inputSchema: rollDiceInputSchema,
});
