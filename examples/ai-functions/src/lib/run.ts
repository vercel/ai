import 'dotenv/config';
import { APICallError } from 'ai';
import { print } from './print';

export function run(fn: () => Promise<void>) {
  fn().catch(error => {
    console.error(error);

    if (APICallError.isInstance(error)) {
      console.log();
      print('Request body:', error.requestBodyValues);
      print('Response body:', error.responseBody);
    }
  });
}
