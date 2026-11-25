import type {
  LanguageModelV4CustomPart,
  LanguageModelV4FilePart,
  LanguageModelV4ReasoningFilePart,
  LanguageModelV4ReasoningPart,
  LanguageModelV4TextPart,
  LanguageModelV4ToolApprovalResponsePart,
  LanguageModelV4ToolCallPart,
  LanguageModelV4ToolResultOutput,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import type { HarnessV1Metadata } from './harness-v1-metadata';

type LanguageModelV4ToolResultContentPart = Extract<
  LanguageModelV4ToolResultOutput,
  { type: 'content' }
>['value'][number];

export type HarnessV1TextPart = Omit<
  LanguageModelV4TextPart,
  'providerOptions'
>;

export type HarnessV1FilePart = Omit<
  LanguageModelV4FilePart,
  'providerOptions'
>;

export type HarnessV1CustomPart = Omit<
  LanguageModelV4CustomPart,
  'providerOptions'
>;

export type HarnessV1ReasoningPart = Omit<
  LanguageModelV4ReasoningPart,
  'providerOptions'
>;

export type HarnessV1ReasoningFilePart = Omit<
  LanguageModelV4ReasoningFilePart,
  'providerOptions'
>;

export type HarnessV1ToolCallPart = Omit<
  LanguageModelV4ToolCallPart,
  'providerOptions'
> & {
  nativeName?: string;
};

export type HarnessV1ToolResultOutput =
  | Omit<
      Extract<LanguageModelV4ToolResultOutput, { type: 'text' }>,
      'providerOptions'
    >
  | Omit<
      Extract<LanguageModelV4ToolResultOutput, { type: 'json' }>,
      'providerOptions'
    >
  | Omit<
      Extract<LanguageModelV4ToolResultOutput, { type: 'execution-denied' }>,
      'providerOptions'
    >
  | Omit<
      Extract<LanguageModelV4ToolResultOutput, { type: 'error-text' }>,
      'providerOptions'
    >
  | Omit<
      Extract<LanguageModelV4ToolResultOutput, { type: 'error-json' }>,
      'providerOptions'
    >
  | {
      type: 'content';
      value: Array<
        | Omit<
            Extract<LanguageModelV4ToolResultContentPart, { type: 'text' }>,
            'providerOptions'
          >
        | Omit<
            Extract<LanguageModelV4ToolResultContentPart, { type: 'file' }>,
            'providerOptions'
          >
        | Omit<
            Extract<LanguageModelV4ToolResultContentPart, { type: 'custom' }>,
            'providerOptions'
          >
      >;
    };

export type HarnessV1ToolResultPart = Omit<
  LanguageModelV4ToolResultPart,
  'output' | 'providerOptions'
> & {
  output: HarnessV1ToolResultOutput;
};

export type HarnessV1ToolApprovalResponsePart = Omit<
  LanguageModelV4ToolApprovalResponsePart,
  'providerOptions'
>;

export type HarnessV1MessagePart =
  | HarnessV1TextPart
  | HarnessV1FilePart
  | HarnessV1CustomPart
  | HarnessV1ReasoningPart
  | HarnessV1ReasoningFilePart
  | HarnessV1ToolCallPart
  | HarnessV1ToolResultPart
  | HarnessV1ToolApprovalResponsePart;

export type HarnessV1UserMessage = {
  readonly role: 'user';
  readonly content: Array<HarnessV1TextPart | HarnessV1FilePart>;
  readonly at?: string;
  readonly harnessMetadata?: HarnessV1Metadata;
};

export type HarnessV1AssistantMessage = {
  readonly role: 'assistant';
  readonly content: Array<
    | HarnessV1TextPart
    | HarnessV1FilePart
    | HarnessV1CustomPart
    | HarnessV1ReasoningPart
    | HarnessV1ReasoningFilePart
    | HarnessV1ToolCallPart
    | HarnessV1ToolResultPart
  >;
  readonly at?: string;
  readonly harnessMetadata?: HarnessV1Metadata;
};

export type HarnessV1ToolMessage = {
  readonly role: 'tool';
  readonly content: Array<
    HarnessV1ToolResultPart | HarnessV1ToolApprovalResponsePart
  >;
  readonly at?: string;
  readonly harnessMetadata?: HarnessV1Metadata;
};

/**
 * A persisted harness message using V4 prompt content shapes and metadata
 * scoped to the adapter that produced it.
 */
export type HarnessV1Message =
  | HarnessV1UserMessage
  | HarnessV1AssistantMessage
  | HarnessV1ToolMessage;
