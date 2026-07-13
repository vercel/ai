import { InvalidArgumentError } from '@ai-sdk/provider';

export function withoutTrailingSlash(url: string | undefined) {
  if (url?.trim() === '') {
    throw new InvalidArgumentError({
      argument: 'baseURL',
      message: 'baseURL must be a non-empty string.',
    });
  }

  return url?.replace(/\/$/, '');
}
