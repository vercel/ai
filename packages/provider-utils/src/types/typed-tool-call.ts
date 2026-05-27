import type { JSONObject, SharedV4ProviderMetadata } from '@ai-sdk/provider';
import type { InferToolInput } from './infer-tool-input';
import type { ToolSet } from './tool-set';

// License for the inlined `ValueOf` helper:
//
// MIT License
//
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
// Copyright (c) Vercel, Inc. (https://vercel.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions
// of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
// CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
//
// @see https://github.com/sindresorhus/type-fest/blob/main/source/value-of.d.ts
type ValueOf<
  ObjectType,
  ValueType extends keyof ObjectType = keyof ObjectType,
> = ObjectType[ValueType];

type BaseToolCall = {
  type: 'tool-call';
  toolCallId: string;
  providerExecuted?: boolean;
  providerMetadata?: SharedV4ProviderMetadata;
  toolMetadata?: JSONObject;
};

/**
 * A tool call whose `toolName` maps to a tool in the declared tool set,
 * with an `input` type inferred from that tool's input schema.
 */
export type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: BaseToolCall & {
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    dynamic?: false | undefined;
    invalid?: false | undefined;
    error?: never;
    title?: string;
  };
}>;

/**
 * A tool call whose `toolName` is only known at runtime, such as an invalid
 * or otherwise untyped call that cannot be matched to the declared tool set.
 */
export type DynamicToolCall = BaseToolCall & {
  toolName: string;
  input: unknown;
  dynamic: true;
  title?: string;

  /**
   * True if this is caused by an unparsable tool call or
   * a tool that does not exist.
   */
  // Added into DynamicToolCall to avoid breaking changes.
  // TODO AI SDK 6: separate into a new InvalidToolCall type
  invalid?: boolean;

  /**
   * The error that caused the tool call to be invalid.
   */
  // TODO AI SDK 6: separate into a new InvalidToolCall type
  error?: unknown;
};

/**
 * A tool call returned by text generation, either statically typed from the
 * declared tool set or dynamically typed when the tool cannot be inferred.
 */
export type TypedToolCall<TOOLS extends ToolSet> =
  | StaticToolCall<TOOLS>
  | DynamicToolCall;
