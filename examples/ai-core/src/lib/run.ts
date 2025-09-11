import 'dotenv/config';
import { APICallError } from 'ai';

export function run(fn: () => Promise<void>) {
  fn().catch(error => {
    if (APICallError.isInstance(error)) {
      console.error(error.responseBody);
    }
    console.error(error);
  });
}
