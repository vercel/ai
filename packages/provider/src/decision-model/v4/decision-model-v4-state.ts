import type { JSONValue } from '../../json-value';
import type {
  LanguageModelV4FilePart,
  LanguageModelV4TextPart,
} from '../../language-model/v4/language-model-v4-prompt';

export type DecisionModelV4State = readonly DecisionModelV4StatePart[];

export type DecisionModelV4StatePart =
  | LanguageModelV4TextPart
  | LanguageModelV4FilePart
  | { type: 'json'; value: JSONValue };
