import { openaiModelCatalog } from '@ai-sdk/openai/internal';
import type { OpenAIProvider } from '@ai-sdk/openai';
import type { ModelCapability } from '@ai-sdk/provider';

export type Entry = (typeof openaiModelCatalog)[string];
export type Probe = {
  name: string;
  covers: readonly string[];
  expected: ModelCapability | number | string;
  compare?: 'value';
  sent?: RegExp | readonly RegExp[];
  parameter?: RegExp;
  /** Use another SDK encoding policy while sending the actual audited model ID. */
  encodingModelId?: string;
  execute: (openai: OpenAIProvider) => Promise<boolean | number | string>;
};
/** Construct only from an error received from the remote API. */
export class APIProbeError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly parameter?: string,
  ) {
    super(message);
  }
}
export type Status = 'MATCH' | 'MISMATCH' | 'UNVERIFIED' | 'MISSING';
export type Reporter = (
  status: Status,
  modelId: string,
  check: string,
  detail: string,
) => void;

export function display(value: unknown): string {
  if (value === true) return 'supported';
  if (value === false) return 'unsupported';
  if (value === undefined) return 'not declared';
  if (typeof value === 'object' && value != null && 'condition' in value)
    return String(value.condition);
  return JSON.stringify(value);
}

export function matchesRequest(
  body: unknown,
  required: Probe['sent'],
): boolean {
  if (required == null) return true;
  const text =
    body instanceof FormData ? JSON.stringify([...body.keys()]) : body;
  return (
    typeof text === 'string' &&
    (Array.isArray(required) ? required : [required]).every(pattern =>
      pattern.test(text),
    )
  );
}

/** Conditions and arrays are cells; an undeclared future field must be visible. */
export function capabilityCells(
  value: unknown,
  prefix = '',
): Array<[string, unknown]> {
  if (value === undefined) return [];
  if (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !('condition' in value) &&
    !('description' in value)
  ) {
    return Object.entries(value).flatMap(([key, cell]) =>
      capabilityCells(cell, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [[prefix, value]];
}

export const capabilityLabels: Record<string, string> = {
  'language.reasoning.support': 'reasoning',
  'language.reasoning.efforts': 'reasoningEfforts',
  'language.reasoning.sampling': 'samplingAtReasoningEffortNone',
  'language.tools.async': 'asyncTools',
  'language.serviceTiers.flex': 'flexProcessing',
  'language.serviceTiers.priority': 'priorityProcessing',
  'language.configurationUpdates': 'configurationUpdates',
  'language.promptCache.retention': 'promptCacheRetention',
  'language.promptCache.options': 'promptCacheOptions',
  'language.endpoints.chat.temperatureWithoutReasoning': 'chatTemperature',
  'language.endpoints.chat.functionToolsWithReasoning':
    'chatFunctionToolsWithReasoning',
  'language.endpoints.responses.logprobsRequireNonReasoning':
    'responsesLogprobsRequireNonReasoning',
};

export function uncoveredCapabilities(
  entry: Entry,
  covered: ReadonlySet<string>,
) {
  return capabilityCells(entry.capabilities).filter(
    ([path]) => !covered.has(path),
  );
}

/** This chooses an encoder, not an expected answer for the audited model. */
export function encodingModel(
  predicate: (
    language: NonNullable<Entry['capabilities']['language']>,
  ) => boolean,
): string | undefined {
  return Object.entries(openaiModelCatalog).find(
    ([, entry]) =>
      entry.capabilities.language && predicate(entry.capabilities.language),
  )?.[0];
}
