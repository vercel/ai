import type { ZodFirstPartyTypeKind } from 'zod/v3';
import { parseAnyDef } from './parsers/any';
import { parseArrayDef } from './parsers/array';
import { parseBigintDef } from './parsers/bigint';
import { parseBooleanDef } from './parsers/boolean';
import { parseBrandedDef } from './parsers/branded';
import { parseCatchDef } from './parsers/catch';
import { parseDateDef } from './parsers/date';
import { parseDefaultDef } from './parsers/default';
import { parseEffectsDef } from './parsers/effects';
import { parseEnumDef } from './parsers/enum';
import { parseIntersectionDef } from './parsers/intersection';
import { parseLiteralDef } from './parsers/literal';
import { parseMapDef } from './parsers/map';
import { parseNativeEnumDef } from './parsers/native-enum';
import { parseNeverDef } from './parsers/never';
import { parseNullDef } from './parsers/null';
import { parseNullableDef } from './parsers/nullable';
import { parseNumberDef } from './parsers/number';
import { parseObjectDef } from './parsers/object';
import { parseOptionalDef } from './parsers/optional';
import { parsePipelineDef } from './parsers/pipeline';
import { parsePromiseDef } from './parsers/promise';
import { parseRecordDef } from './parsers/record';
import { parseSetDef } from './parsers/set';
import { parseStringDef } from './parsers/string';
import { parseTupleDef } from './parsers/tuple';
import { parseUndefinedDef } from './parsers/undefined';
import { parseUnionDef } from './parsers/union';
import { parseUnknownDef } from './parsers/unknown';
import type { Refs } from './refs';
import { parseReadonlyDef } from './parsers/readonly';
import type { JsonSchema7Type } from './parse-types';

export type InnerDefGetter = () => any;

type Zod3TypeName = `${ZodFirstPartyTypeKind}`;

export const selectParser = (
  def: any,
  typeName: Zod3TypeName,
  refs: Refs,
): JsonSchema7Type | undefined | InnerDefGetter => {
  switch (typeName) {
    case 'ZodString':
      return parseStringDef(def, refs);
    case 'ZodNumber':
      return parseNumberDef(def);
    case 'ZodObject':
      return parseObjectDef(def, refs);
    case 'ZodBigInt':
      return parseBigintDef(def);
    case 'ZodBoolean':
      return parseBooleanDef();
    case 'ZodDate':
      return parseDateDef(def, refs);
    case 'ZodUndefined':
      return parseUndefinedDef();
    case 'ZodNull':
      return parseNullDef();
    case 'ZodArray':
      return parseArrayDef(def, refs);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      return parseUnionDef(def, refs);
    case 'ZodIntersection':
      return parseIntersectionDef(def, refs);
    case 'ZodTuple':
      return parseTupleDef(def, refs);
    case 'ZodRecord':
      return parseRecordDef(def, refs);
    case 'ZodLiteral':
      return parseLiteralDef(def);
    case 'ZodEnum':
      return parseEnumDef(def);
    case 'ZodNativeEnum':
      return parseNativeEnumDef(def);
    case 'ZodNullable':
      return parseNullableDef(def, refs);
    case 'ZodOptional':
      return parseOptionalDef(def, refs);
    case 'ZodMap':
      return parseMapDef(def, refs);
    case 'ZodSet':
      return parseSetDef(def, refs);
    case 'ZodLazy':
      return () => (def as any).getter()._def;
    case 'ZodPromise':
      return parsePromiseDef(def, refs);
    case 'ZodNaN':
    case 'ZodNever':
      return parseNeverDef();
    case 'ZodEffects':
      return parseEffectsDef(def, refs);
    case 'ZodAny':
      return parseAnyDef();
    case 'ZodUnknown':
      return parseUnknownDef();
    case 'ZodDefault':
      return parseDefaultDef(def, refs);
    case 'ZodBranded':
      return parseBrandedDef(def, refs);
    case 'ZodReadonly':
      return parseReadonlyDef(def, refs);
    case 'ZodCatch':
      return parseCatchDef(def, refs);
    case 'ZodPipeline':
      return parsePipelineDef(def, refs);
    case 'ZodFunction':
    case 'ZodVoid':
    case 'ZodSymbol':
      return undefined;
    default:
      /* c8 ignore next */
      return ((_: never) => undefined)(typeName);
  }
};
