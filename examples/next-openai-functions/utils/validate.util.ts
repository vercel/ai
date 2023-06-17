import { AnyZodObject, ZodError, z } from 'zod';

export function zValidateEnv<T extends AnyZodObject>(schema: T): z.infer<T> {
  const _env = schema.safeParse(process.env);
  if (!_env.success) {
    console.error('❌ Invalid environment variables:\n');
    _env.error.issues.forEach((issue) => {
      console.error(issue);
    });
    throw new Error('Invalid environment variables');
  }
  return _env.data;
}
