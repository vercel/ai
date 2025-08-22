import { ZodBrandedDef } from "zod";
import { parseDef } from "../parseDef.js";
import { Refs } from "../Refs.js";

export function parseBrandedDef(_def: ZodBrandedDef<any>, refs: Refs) {
  return parseDef(_def.type._def, refs);
}
