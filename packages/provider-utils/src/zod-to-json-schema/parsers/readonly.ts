import { ZodReadonlyDef } from 'zod';
import { parseDef } from '../parse-def';
import { Refs } from '../refs';

export const parseReadonlyDef = (def: ZodReadonlyDef<any>, refs: Refs) => {
  return parseDef(def.innerType._def, refs);
};
