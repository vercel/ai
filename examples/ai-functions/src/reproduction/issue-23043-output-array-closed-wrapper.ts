import { isDeepStrictEqual } from 'node:util';
import { Output } from 'ai';
import { z } from 'zod/v4';

const failureSignal =
  'ISSUE #23043 REPRODUCED: Output.array omitted a completed element when only the outer object needed repair';

async function main() {
  const output = Output.array({ element: z.number() });

  const complete = await output.parsePartialOutput({
    text: '{"elements":[1]}',
  });
  const closedArray = await output.parsePartialOutput({
    text: '{"elements":[1]',
  });
  const unfinishedNumber = await output.parsePartialOutput({
    text: '{"elements":[1',
  });

  if (!isDeepStrictEqual(complete?.partial, [1])) {
    throw new Error(
      `Control failed: complete wrapper should produce [1], received ${JSON.stringify(complete?.partial)}`,
    );
  }

  if (!isDeepStrictEqual(unfinishedNumber?.partial, [])) {
    throw new Error(
      `Control failed: unfinished number should produce [], received ${JSON.stringify(unfinishedNumber?.partial)}`,
    );
  }

  if (!isDeepStrictEqual(closedArray?.partial, [1])) {
    throw new Error(
      `${failureSignal}; received ${JSON.stringify(closedArray?.partial)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
