import { z } from 'zod'

export const envsSchema = z.object({
  OPENAI_API_KEY: z.string(),
  WEATHER_API_KEY: z.string()
})
