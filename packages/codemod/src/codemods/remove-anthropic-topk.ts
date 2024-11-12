import { API, FileInfo } from 'jscodeshift';
import { removeTopK } from './lib/remove-topk';

export default function transformer(fileInfo: FileInfo, api: API) {
  return removeTopK(fileInfo, api, 'createAnthropic');
}
