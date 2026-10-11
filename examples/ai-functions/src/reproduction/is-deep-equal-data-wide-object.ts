import assert from 'node:assert/strict';
import { isDeepEqualData } from 'ai';

const sizes = [1000, 2000] as const;

async function main() {
  const originalIncludes = Array.prototype.includes;
  const measurements: Array<{ size: number; keyProbes: number }> = [];

  for (const size of sizes) {
    const left = Object.fromEntries(
      Array.from({ length: size }, (_, index) => [`key-${index}`, index]),
    );
    const right = JSON.parse(JSON.stringify(left));
    let keyProbes = 0;

    const instrumentedIncludes = function (
      this: unknown[],
      value: unknown,
      fromIndex?: number,
    ): boolean {
      if (typeof value === 'string' && value.startsWith('key-')) {
        const position = this.indexOf(value, fromIndex);
        keyProbes += position < 0 ? this.length : position + 1;
      }

      return originalIncludes.call(this, value, fromIndex);
    };
    Reflect.set(Array.prototype, 'includes', instrumentedIncludes);

    try {
      assert.equal(isDeepEqualData(left, right), true);
    } finally {
      Reflect.set(Array.prototype, 'includes', originalIncludes);
    }

    measurements.push({ size, keyProbes });
  }

  console.log(JSON.stringify(measurements));

  const [smaller, larger] = measurements;
  assert.ok(
    larger.keyProbes <= 2 * smaller.keyProbes + 10,
    `Quadratic key membership scans reproduced: doubling keys increased probes from ${smaller.keyProbes} to ${larger.keyProbes}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
