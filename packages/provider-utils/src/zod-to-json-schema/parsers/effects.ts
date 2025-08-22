import { ZodEffectsDef } from "zod";
import { parseDef } from "../parseDef.js";
import { JsonSchema7Type } from "../parseTypes.js";
import { Refs } from "../Refs.js";
import { parseAnyDef } from "./any.js";

export function parseEffectsDef(
  _def: ZodEffectsDef,
  refs: Refs,
): JsonSchema7Type | undefined {
  return refs.effectStrategy === "input"
    ? parseDef(_def.schema._def, refs)
    : parseAnyDef(refs);
}
