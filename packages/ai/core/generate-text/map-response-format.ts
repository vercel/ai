export function mapResponseFormat(responseFormat: 'text' | 'json' | undefined) {
  switch (responseFormat) {
    case 'text':
      return { type: 'text' } as const;
    case 'json':
      return { type: 'json' } as const;
    case undefined:
      return undefined;
    default:
      throw new Error(`Unsupported response format: ${responseFormat}`);
  }
}
