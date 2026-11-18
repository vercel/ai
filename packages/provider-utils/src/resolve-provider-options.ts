import type { FlexibleSchema } from './schema';
import { parseProviderOptions } from './parse-provider-options';

/**
 * How options found under several `providerOptions` namespaces are combined.
 *
 * - `first`: namespaces are aliases. The first namespace that is present wins
 *   as a whole and later namespaces are ignored (no merging).
 * - `merge`: every present namespace is parsed and the results are merged in
 *   order, so later namespaces override earlier ones key by key.
 */
export type ProviderOptionsResolution = 'first' | 'merge';

/**
 * Parses provider options that a model accepts under more than one
 * `providerOptions` namespace, e.g. a canonical key plus a provider-specific
 * or legacy alias.
 *
 * Each present namespace is validated against `schema` exactly like
 * `parseProviderOptions` does, so an invalid namespace throws.
 *
 * @returns the resolved options (`undefined` when no namespace is present)
 * and the namespaces that contributed to them, in resolution order.
 */
export async function resolveProviderOptions<OPTIONS>({
  providerOptions,
  namespaces,
  resolution,
  schema,
}: {
  providerOptions: Record<string, unknown> | undefined;
  namespaces: readonly string[];
  resolution: ProviderOptionsResolution;
  schema: FlexibleSchema<OPTIONS>;
}): Promise<{
  options: OPTIONS | undefined;
  namespaces: string[];
}> {
  const parsed: OPTIONS[] = [];
  const matched: string[] = [];

  for (const namespace of new Set(namespaces)) {
    const options = await parseProviderOptions({
      provider: namespace,
      providerOptions,
      schema,
    });

    if (options == null) {
      continue;
    }

    if (resolution === 'first') {
      return { options, namespaces: [namespace] };
    }

    parsed.push(options);
    matched.push(namespace);
  }

  return {
    options:
      parsed.length === 0
        ? undefined
        : (Object.assign({}, ...parsed) as OPTIONS),
    namespaces: matched,
  };
}
