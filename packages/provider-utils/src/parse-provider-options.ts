import { InvalidArgumentError } from '@ai-sdk/provider';
import { safeValidateTypes } from './validate-types';
import { FlexibleValidator } from './validator';

export async function parseProviderOptions<OPTIONS>({
  provider,
  providerOptions,
  schema,
}: {
  provider: string;
  providerOptions: Record<string, unknown> | undefined;
  schema: FlexibleValidator<OPTIONS>;
}): Promise<OPTIONS | undefined> {
  if (providerOptions?.[provider] == null) {
    return undefined;
  }

  const parsedProviderOptions = await safeValidateTypes<OPTIONS | undefined>({
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
