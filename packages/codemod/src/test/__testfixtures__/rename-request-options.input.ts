// @ts-nocheck
import type { RequestOptions } from 'ai';
import { RequestOptions as ReqOpts } from 'ai';
import { useCompletion, RequestOptions as CompletionReq } from 'ai';

// Type annotations
function handleRequest(options: RequestOptions): void {
  console.log(options);
}

// With aliased import
function processOptions(opts: ReqOpts): void {
  console.log(opts);
}

// Function return type
function getDefaultOptions(): RequestOptions {
  return { api: '/api/completion' };
}

// Array type
const optionsArray: RequestOptions[] = [];

// Union type
type OptionsOrString = RequestOptions | string;

// Interface extending
interface CustomOptions extends RequestOptions {
  customField: string;
}

// Generic type usage
type OptionWrapper<T = RequestOptions> = {
  data: T;
};

// Object property type
interface CompletionHandler {
  options: RequestOptions;
  process: (opts: RequestOptions) => void;
}

// Mixed with other imports from 'ai'
function useCompletionWithOptions(opts: RequestOptions) {
  return useCompletion({
    ...opts,
    api: '/api/completion',
  });
}

// Type alias
type MyRequestOptions = RequestOptions;

// With aliased import usage
function handleAliased(options: CompletionReq): void {
  console.log(options);
}

// From other packages (should not transform)
import { RequestOptions as OtherRequestOptions } from 'other-package';
function handleOther(opts: OtherRequestOptions): void {
  console.log(opts);
}
