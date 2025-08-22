import { ZodReadonlyDef } from "zod";
import { parseDef } from "../parseDef.js";
import { Refs } from "../Refs.js";

export const parseReadonlyDef = (def: ZodReadonlyDef<any>, refs: Refs) => {
  return parseDef(def.innerType._def, refs);
};
