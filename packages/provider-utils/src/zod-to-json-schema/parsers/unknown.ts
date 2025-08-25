import { Refs } from '../refs';
import { JsonSchema7AnyType, parseAnyDef } from './any';

export type JsonSchema7UnknownType = JsonSchema7AnyType;

export function parseUnknownDef(refs: Refs): JsonSchema7UnknownType {
  return parseAnyDef(refs);
}
