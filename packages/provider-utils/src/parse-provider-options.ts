import { InvalidArgumentError } from '@ai-sdk/provider';
import { safeValidateTypes } from './validate-types';
import type { FlexibleSchema } from './schema';

export async function parseProviderOptions<OPTIONS>({
  provider,
  providerOptions,
  schema,
}: {
  /** Namespace, or namespaces ordered from lowest to highest precedence. */
  provider: string | readonly string[];
  providerOptions: Record<string, unknown> | undefined;
  schema: FlexibleSchema<OPTIONS>;
}): Promise<OPTIONS | undefined> {
  let value: unknown;

  if (typeof provider === 'string') {
    value = providerOptions?.[provider];
  } else {
    for (const namespace of new Set(provider)) {
      const options = providerOptions?.[namespace];
      if (options == null) continue;

      if (typeof options !== 'object' || Array.isArray(options)) {
        throw new InvalidArgumentError({
          argument: 'providerOptions',
          message: `invalid ${namespace} provider options`,
        });
      }

      value = {
        ...(value as Record<string, unknown> | undefined),
        ...Object.fromEntries(
          Object.entries(options).filter(([, option]) => option !== undefined),
        ),
      };
    }
  }

  if (value == null) {
    return undefined;
  }

  const parsedProviderOptions = await safeValidateTypes<OPTIONS | undefined>({
    value,
    schema,
  });

  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `invalid ${typeof provider === 'string' ? provider : [...new Set(provider)].join('/')} provider options`,
      cause: parsedProviderOptions.error,
    });
  }

  return parsedProviderOptions.value;
}
