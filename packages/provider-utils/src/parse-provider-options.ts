import { InvalidArgumentError } from '@ai-sdk/provider';
import { safeValidateTypes } from './validate-types';
import { z } from 'zod';

export async function parseProviderOptions<T>({
  provider,
  providerOptions,
  schema,
}: {
  provider: string;
  providerOptions: Record<string, unknown> | undefined;
  schema: z.ZodSchema<T>;
}): Promise<T | undefined> {
  if (providerOptions?.[provider] == null) {
    return undefined;
  }

  const parsedProviderOptions = await safeValidateTypes({
    value: providerOptions[provider],
    schema,
  });

  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `invalid ${provider} provider options`,
      cause: parsedProviderOptions.error,
    });
  }

  return parsedProviderOptions.value;
}
