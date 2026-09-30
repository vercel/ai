import { InvalidArgumentError } from '@ai-sdk/provider';
import { isValidDnsLabel } from '@ai-sdk/provider-utils';

export function validateGoogleVertexLocation(location: string): string {
  if (!isValidDnsLabel(location)) {
    throw new InvalidArgumentError({
      argument: 'location',
      message:
        'Invalid Google Vertex location. Expected a single DNS label (letters, digits, and hyphens). Use `baseURL` for custom endpoints.',
    });
  }
  return location;
}
