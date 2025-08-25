import { Refs } from '../refs';
import { JsonSchema7AnyType, parseAnyDef } from './any';

export type JsonSchema7UndefinedType = {
  not: JsonSchema7AnyType;
};

export function parseUndefinedDef(refs: Refs): JsonSchema7UndefinedType {
  return {
    not: parseAnyDef(refs),
  };
}
