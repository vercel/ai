import { PartialDeep } from 'type-fest';
import { z } from 'zod';

export const itinerarySchema = z.object({
  days: z.array(
    z.object({
      theme: z.string(),
      activities: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          duration: z.number(),
        }),
      ),
    }),
  ),
});

export type PartialItinerary = PartialDeep<
  z.infer<typeof itinerarySchema>,
  { recurseIntoArrays: true }
>;
