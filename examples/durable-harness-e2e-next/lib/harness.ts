/**
 * Harnesses a chat can run on, in the order the app offers them.
 */
export const HARNESSES = [
  { name: 'pi', label: 'Pi' },
  { name: 'fx', label: 'fx' },
] as const;

/**
 * Name of a harness a chat can run on.
 */
export type HarnessName = (typeof HARNESSES)[number]['name'];

const DEFAULT_HARNESS: HarnessName = 'pi';

const PREFERENCE_STORAGE_KEY = 'durable-harness-preferred-harness';

function chatHarnessStorageKeyFor({ chatId }: { chatId: string }): string {
  return `durable-harness-chat-harness:${chatId}`;
}

/**
 * Returns whether a value is the name of a harness a chat can run on.
 */
export function isHarnessName(value: unknown): value is HarnessName {
  return HARNESSES.some(({ name }) => name === value);
}

/**
 * Returns the user-facing label of a harness.
 */
export function getHarnessLabel({ harness }: { harness: HarnessName }): string {
  return HARNESSES.find(({ name }) => name === harness)?.label ?? harness;
}

/**
 * Reads the harness that new sessions use by default from local storage, so
 * that the choice persists across browser sessions.
 */
export function readHarnessPreference(): HarnessName {
  const value = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
  return isHarnessName(value) ? value : DEFAULT_HARNESS;
}

/**
 * Writes the harness that new sessions use by default to local storage.
 */
export function writeHarnessPreference({
  harness,
}: {
  harness: HarnessName;
}): void {
  window.localStorage.setItem(PREFERENCE_STORAGE_KEY, harness);
}

/**
 * Reads the harness a chat runs on from session storage.
 */
export function readChatHarness({
  chatId,
}: {
  chatId: string;
}): HarnessName | undefined {
  const value = window.sessionStorage.getItem(
    chatHarnessStorageKeyFor({ chatId }),
  );
  return isHarnessName(value) ? value : undefined;
}

/**
 * Writes the harness a chat runs on to session storage.
 */
export function writeChatHarness({
  chatId,
  harness,
}: {
  chatId: string;
  harness: HarnessName;
}): void {
  window.sessionStorage.setItem(chatHarnessStorageKeyFor({ chatId }), harness);
}

/**
 * Removes the harness a chat runs on from session storage.
 */
export function clearChatHarness({ chatId }: { chatId: string }): void {
  window.sessionStorage.removeItem(chatHarnessStorageKeyFor({ chatId }));
}
