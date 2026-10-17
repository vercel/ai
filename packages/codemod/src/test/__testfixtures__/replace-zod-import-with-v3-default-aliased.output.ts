// @ts-nocheck
import { z as validator } from 'zod/v3';
import { z as schemaLib } from 'zod/v3';

const schema = validator.object({ name: validator.string() });
const other = schemaLib.object({ age: schemaLib.number() });

export { schema, other };

// Mixed default + named imports keep both working
import { z as helper, ZodSchema } from 'zod/v3';

const mixed = helper.string();
const typed: ZodSchema = helper.string();
