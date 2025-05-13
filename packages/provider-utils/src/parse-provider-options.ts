import { InvalidArgumentError } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { safeValidateTypes } from './validate-types';

export async function parseProviderOptions<T extends StandardSchemaV1>({
  provider,
  providerOptions,
  schema,
}: {
  provider: string;
  providerOptions: Record<string, unknown> | undefined;
  schema: T;
}): Promise<StandardSchemaV1.InferInput<T> | undefined> {
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
