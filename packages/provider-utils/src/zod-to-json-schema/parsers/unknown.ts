import { Refs } from "../Refs";
import { JsonSchema7AnyType, parseAnyDef } from "./any.js";

export type JsonSchema7UnknownType = JsonSchema7AnyType;

export function parseUnknownDef(refs: Refs): JsonSchema7UnknownType {
  return parseAnyDef(refs);
}
