import { z } from 'zod/v4';

export const jcodeResumeDataSchema = z.object({
  jcodeSessionId: z.string(),
  jcodeHome: z.string().optional(),
});

export type JcodeResumeData = z.infer<typeof jcodeResumeDataSchema>;
