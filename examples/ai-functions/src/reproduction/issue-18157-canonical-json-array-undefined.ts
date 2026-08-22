async function main() {
  const moduleUrl = new URL(
    '../../../../packages/ai/src/util/canonical-hash.ts',
    import.meta.url,
  ).href;
  const { canonicalJSON, hashCanonical } = (await import(moduleUrl)) as {
    canonicalJSON(value: unknown): string;
    hashCanonical(value: unknown): Promise<string>;
  };

  const emptyArrayJSON = canonicalJSON([]);
  const undefinedArrayJSON = canonicalJSON([undefined]);
  const emptyArrayHash = await hashCanonical([]);
  const undefinedArrayHash = await hashCanonical([undefined]);

  if (
    emptyArrayJSON === undefinedArrayJSON &&
    emptyArrayHash === undefinedArrayHash
  ) {
    console.error(
      'ISSUE #18157 REPRODUCED: [] and [undefined] have identical canonical JSON and SHA-256 digests.',
    );
    console.error(`canonical JSON: ${JSON.stringify(emptyArrayJSON)}`);
    console.error(`SHA-256 digest: ${emptyArrayHash}`);
    process.exitCode = 1;
    return;
  }

  console.log('[] and [undefined] have distinct canonical representations.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
