import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reactPackageRequire = createRequire(
  resolve(process.cwd(), 'package.json'),
);
const nextOpenAiPagesRequire = createRequire(
  resolve(process.cwd(), '../../examples/next-openai-pages/package.json'),
);

function resolvePackageJson(
  requireFromWorkspace: NodeJS.Require,
  packageName: string,
) {
  return requireFromWorkspace.resolve(`${packageName}/package.json`);
}

describe('workspace React resolution', () => {
  it('uses the same React packages as the Pages Router example', () => {
    expect(resolvePackageJson(reactPackageRequire, 'react')).toBe(
      resolvePackageJson(nextOpenAiPagesRequire, 'react'),
    );
    expect(resolvePackageJson(reactPackageRequire, 'react-dom')).toBe(
      resolvePackageJson(nextOpenAiPagesRequire, 'react-dom'),
    );
  });
});
