// @ts-nocheck
import type { CompletionRequestOptions } from 'ai';
import { CompletionRequestOptions as ReqOpts } from 'ai';
import { useCompletion, CompletionRequestOptions as CompletionReq } from 'ai';

// Type annotations
function handleRequest(options: CompletionRequestOptions): void {
  console.log(options);
}

// With aliased import
function processOptions(opts: ReqOpts): void {
  console.log(opts);
}

// Function return type
function getDefaultOptions(): CompletionRequestOptions {
  return { api: '/api/completion' };
}

// Array type
const optionsArray: CompletionRequestOptions[] = [];

// Union type
type OptionsOrString = CompletionRequestOptions | string;

// Interface extending
interface CustomOptions extends CompletionRequestOptions {
  customField: string;
}

// Generic type usage
type OptionWrapper<T = CompletionRequestOptions> = {
  data: T;
};

// Object property type
interface CompletionHandler {
  options: CompletionRequestOptions;
  process: (opts: CompletionRequestOptions) => void;
}

// Mixed with other imports from 'ai'
function useCompletionWithOptions(opts: CompletionRequestOptions) {
  return useCompletion({
    ...opts,
    api: '/api/completion'
  });
}

// Type alias
type MyRequestOptions = CompletionRequestOptions;

// With aliased import usage
function handleAliased(options: CompletionReq): void {
  console.log(options);
}

// From other packages (should not transform)
import { RequestOptions as OtherRequestOptions } from 'other-package';
function handleOther(opts: OtherRequestOptions): void {
  console.log(opts);
} 