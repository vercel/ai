import { FetchFunction } from '@ai-sdk/provider-utils';

export function createFakeFetch(
  customHeaders: Record<string, string>,
): FetchFunction {
  return async (input, init = {}) => {
    // Ensure headers is a plain object, Headers instance, or array.
    if (init.headers instanceof Headers) {
      for (const [key, value] of Object.entries(customHeaders)) {
        init.headers.set(key, value);
      }
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of Object.entries(customHeaders)) {
        init.headers.push([key, value]);
      }
    } else {
      init.headers = { ...(init.headers || {}), ...customHeaders };
    }
    // Delegate to the global fetch (MSW will intercept it).
    return await globalThis.fetch(input, init);
  };
}
