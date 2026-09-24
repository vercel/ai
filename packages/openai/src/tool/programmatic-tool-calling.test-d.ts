import { expectTypeOf } from 'vitest';
import { openai } from '../openai-provider';

const programmaticToolCalling = openai.tools.programmaticToolCalling();

expectTypeOf(programmaticToolCalling.inputSchema).not.toBeNever();
expectTypeOf(programmaticToolCalling.outputSchema).not.toBeNever();
