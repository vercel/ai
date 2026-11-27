import { tool } from 'ai';
import { z } from 'zod';

/**
 * Temperatures in degrees Celsius that the demo weather tool reports, with
 * a default for any other city.
 */
const TEMPERATURES: Record<string, number> = {
  Paris: 12,
  Tokyo: 18,
  Reykjavik: 3,
  'San Francisco': 16,
  Austin: 28,
};

/**
 * Demo tool that reports the current temperature for a city. It has no side
 * effects, so it is a simple subject for tool approvals.
 */
export const weatherTool = tool({
  description: 'Gets the current temperature for a city.',
  inputSchema: z.object({
    city: z.string().describe('Name of the city.'),
  }),
  outputSchema: z.object({ city: z.string(), celsius: z.number() }),
  async execute({ city }) {
    return { city, celsius: TEMPERATURES[city] ?? 20 };
  },
});
