import { APICallError } from 'ai';

export function run(fn: () => Promise<void>) {
  fn().catch(error => {
    if (APICallError.isInstance(error)) {
      console.error(JSON.stringify(error.responseBody, null, 2));
    }
    console.error(error);
  });
}
