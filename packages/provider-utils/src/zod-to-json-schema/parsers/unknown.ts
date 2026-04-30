import type { JsonSchema7AnyType} from './any';
import { parseAnyDef } from './any';

export type JsonSchema7UnknownType = JsonSchema7AnyType;

export function parseUnknownDef(): JsonSchema7UnknownType {
  return parseAnyDef();
}
