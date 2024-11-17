import { API, FileInfo } from 'jscodeshift';
import { removeAwaitFn } from './lib/remove-await-fn';

export default function transformer(file: FileInfo, api: API) {
  return removeAwaitFn(file, api, 'streamText');
}
