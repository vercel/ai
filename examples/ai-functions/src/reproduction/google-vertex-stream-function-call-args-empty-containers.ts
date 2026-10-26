import 'dotenv/config';
import { googleVertex } from '@ai-sdk/google-vertex';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

// https://github.com/vercel/ai/issues/23760
const inputSchema = z.object({
  id: z.string(),
  emptyArr: z.string().array().optional(),
  emptyObj: z.object({ a: z.string().optional() }).optional(),
  emptyStr: z.string().optional(),
  nested: z.object({ tags: z.string().array() }).optional(),
  zero: z.number().optional(),
  no: z.boolean().optional(),
});

run(async () => {
  for (const streamFunctionCallArguments of [true, false]) {
    const result = streamText({
      model: googleVertex('gemini-3.1-pro-preview'),
      providerOptions: {
        vertex: { streamFunctionCallArguments },
      },
      tools: { t: tool({ inputSchema, execute: async () => ({ ok: true }) }) },
      toolChoice: 'required',
      stopWhen: () => true,
      prompt:
        'Call t with exactly: id "x", emptyArr [], emptyObj {}, emptyStr "", nested {"tags": []}, zero 0, no false.',
      include: { rawChunks: true },
    });

    for await (const part of result.stream) {
      if (part.type === 'raw' && process.env.RAW) {
        console.log('[raw]', JSON.stringify(part.rawValue));
      }
      if (part.type === 'tool-call') {
        console.log(
          `streamFunctionCallArguments=${streamFunctionCallArguments}`,
          JSON.stringify(part.input),
        );
      }
    }
  }
});
