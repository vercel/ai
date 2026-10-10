import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Output } from 'ai';
import type * as z4 from 'zod/v4';

type ValidateFunction = ((value: unknown) => boolean) & {
  errors?: unknown;
};

type AjvConstructor = new () => {
  compile(schema: unknown): ValidateFunction;
};

const requireFromWorkflow = createRequire(
  new URL('../../../../packages/workflow/package.json', import.meta.url),
);
const ajvModule = requireFromWorkflow('ajv') as {
  default?: AjvConstructor;
};
const Ajv = (ajvModule.default ?? ajvModule) as AjvConstructor;

const requireFromKonsistentProvider = createRequire(
  new URL(
    '../../../../tools/konsistent-provider/package.json',
    import.meta.url,
  ),
);
const { z } = requireFromKonsistentProvider('zod') as {
  z: typeof z4.z;
};

async function main() {
  const Tree = z.object({
    value: z.string(),
    get children(): ReturnType<typeof z.array<typeof Tree>> {
      return z.array(Tree);
    },
  });

  const tree = {
    value: 'root',
    children: [{ value: 'leaf', children: [] }],
  };

  assert.equal(
    Tree.safeParse(tree).success,
    true,
    'control failed: Zod rejected the recursive tree',
  );

  const ajv = new Ajv();

  const objectFormat = await Output.object({ schema: Tree }).responseFormat;
  assert.ok(
    objectFormat?.type === 'json' && objectFormat.schema != null,
    'control failed: Output.object did not produce a JSON schema',
  );
  assert.equal(
    ajv.compile(objectFormat.schema)(tree),
    true,
    'control failed: Output.object schema rejected the recursive tree',
  );

  const arrayFormat = await Output.array({ element: Tree }).responseFormat;
  assert.ok(
    arrayFormat?.type === 'json' && arrayFormat.schema != null,
    'control failed: Output.array did not produce a JSON schema',
  );

  const validateArray = ajv.compile(arrayFormat.schema);
  const valid = validateArray({ elements: [tree] });

  assert.equal(
    valid,
    true,
    `ISSUE #22572: Output.array response schema rejects a valid root-recursive element\n${JSON.stringify(
      validateArray.errors,
      null,
      2,
    )}`,
  );
}

main();
