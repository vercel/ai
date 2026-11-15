const PREPARED_SANDBOX_IDENTITY_VERSION = 1;

export async function resolvePreparedSandboxIdentity({
  recipeIdentities,
  bootstrapHash,
  workDir,
}: {
  readonly recipeIdentities: Record<string, string>;
  readonly bootstrapHash?: string;
  readonly workDir?: string;
}): Promise<string | undefined> {
  const entries = Object.entries(recipeIdentities).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0 && bootstrapHash == null) return undefined;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushString = (value: string) => {
    chunks.push(encoder.encode(value));
    chunks.push(encoder.encode('\0'));
  };
  pushString(String(PREPARED_SANDBOX_IDENTITY_VERSION));
  pushString(workDir ?? '');
  pushString(bootstrapHash ?? '');
  for (const [harnessId, identity] of entries) {
    pushString(harnessId);
    pushString(identity);
  }
  const buffer = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest.slice(0, 8), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
