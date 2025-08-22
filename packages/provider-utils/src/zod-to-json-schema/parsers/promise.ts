import { ZodPromiseDef } from "zod";
import { parseDef } from "../parseDef.js";
import { JsonSchema7Type } from "../parseTypes.js";
import { Refs } from "../Refs.js";

export function parsePromiseDef(
  def: ZodPromiseDef,
  refs: Refs,
): JsonSchema7Type | undefined {
  return parseDef(def.type._def, refs);
}
