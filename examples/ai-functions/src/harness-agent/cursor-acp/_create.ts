import {
  createCursorACP as createCursorACPHarness,
  type CursorACPHarnessSettings,
} from '../../lib/cursor-acp-harness';

export function createCursorACP(
  settings: CursorACPHarnessSettings = {},
): ReturnType<typeof createCursorACPHarness> {
  return createCursorACPHarness(settings);
}
