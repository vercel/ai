import { InvalidArgumentError } from '@ai-sdk/provider';
import { isValidDnsLabel } from '@ai-sdk/provider-utils';

export function validateAmazonBedrockRegion(region: string): string {
  if (!isValidDnsLabel(region)) {
    throw new InvalidArgumentError({
      argument: 'region',
      message:
        'Invalid AWS region. Expected a single DNS label (letters, digits, and hyphens). Use `baseURL` for custom endpoints.',
    });
  }
  return region;
}
