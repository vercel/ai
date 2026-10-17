// @ts-nocheck
import validator from 'zod';
import schemaLib from 'zod';

const schema = validator.object({ name: validator.string() });
const other = schemaLib.object({ age: schemaLib.number() });

export { schema, other };

// Mixed default + named imports keep both working
import helper, { ZodSchema } from 'zod';

const mixed = helper.string();
const typed: ZodSchema = helper.string();
