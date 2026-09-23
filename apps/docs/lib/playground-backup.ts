const layoutKey = 'ai-playground-editor-layout-137';
const panelPrefix = 'ai-playground-editor-chat-137_';

/** Version 1 of the backup contract consumed by vercel/ai-studio's /recover. */
export function createPlaygroundBackup(storage: Storage, sourceOrigin: string) {
  const entries: [string, string][] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    const allowed =
      key === layoutKey ||
      key === 'pre-auth-input' ||
      key === 'pre-auth-attachments' ||
      (key.startsWith(panelPrefix) &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(key.slice(panelPrefix.length)));
    if (!allowed) continue;
    const value = storage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  // Keep values opaque here; the importer validates and sanitizes them before
  // writing. No cookies, auth-user profile, or unrelated site storage is read.
  const backup = JSON.stringify({
    type: 'ai-sdk-playground-browser-state',
    version: 1,
    sourceOrigin,
    createdAt: new Date().toISOString(),
    entries,
  });
  if (new Blob([backup]).size > 5 * 1024 * 1024 || entries.length > 128) {
    throw new Error('Saved browser data exceeds the 5 MB backup limit.');
  }
  return { backup, count: entries.length };
}
