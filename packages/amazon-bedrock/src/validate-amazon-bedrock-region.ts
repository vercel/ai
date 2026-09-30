import { InvalidArgumentError } from '@ai-sdk/provider';
import { isValidHostnamePart } from '@ai-sdk/provider-utils';

export function validateAmazonBedrockRegion(region: string): string {
  if (!isValidHostnamePart(region)) {
    throw new InvalidArgumentError({
      argument: 'region',
      message:
        'Invalid AWS region. Expected a single DNS label (letters, digits, and hyphens). Use `baseURL` for custom endpoints.',
    });
  }
  return region;
}
