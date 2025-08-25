import { Refs } from '../refs';
import { JsonSchema7AnyType, parseAnyDef } from './any';

export type JsonSchema7NeverType = {
  not: JsonSchema7AnyType;
};

export function parseNeverDef(refs: Refs): JsonSchema7NeverType | undefined {
  return refs.target === 'openAi'
    ? undefined
    : {
        not: parseAnyDef({
          ...refs,
          currentPath: [...refs.currentPath, 'not'],
        }),
      };
}
