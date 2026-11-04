import type { Attributes } from '@opentelemetry/api';
import type { JSONObject, JSONValue } from '@ai-sdk/provider';

const usageKeyAliases: Record<string, string> = {
  inputtokens: 'input_tokens',
  prompttokens: 'input_tokens',
  prompttokencount: 'input_tokens',
  totalinputtokens: 'input_tokens',
  outputtokens: 'output_tokens',
  completiontokens: 'output_tokens',
  completiontokencount: 'output_tokens',
  candidatestokencount: 'output_tokens',
  totaltokens: 'total_tokens',
  totaltokencount: 'total_tokens',
};

function normalizeUsageKey(key: string): string {
  const aliasKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const alias = usageKeyAliases[aliasKey];

  if (alias != null) {
    return alias;
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Converts provider-native usage objects into numeric span attributes.
 *
 * Usage units such as tokens, characters, and seconds remain distinct so
 * observability backends can apply the provider/model-specific price unit.
 */
export function getProviderUsageAttributes({
  usage,
  prefix,
}: {
  usage: JSONObject | undefined;
  prefix: string;
}): Attributes {
  const attributes: Attributes = {};

  const addValue = (value: JSONValue | undefined, path: string[]) => {
    if (typeof value === 'number') {
      if (Number.isFinite(value) && path.length > 0) {
        attributes[`${prefix}.${path.join('.')}`] = value;
      }
      return;
    }

    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = normalizeUsageKey(key);
      if (normalizedKey !== '') {
        addValue(nestedValue, [...path, normalizedKey]);
      }
    }
  };

  addValue(usage, []);
  return attributes;
}
