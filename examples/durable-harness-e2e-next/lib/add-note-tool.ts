import { tool } from 'ai';
import { z } from 'zod';

/**
 * Relative path of the note in the sandbox.
 */
const NOTE_PATH = 'NOTE.md';

/**
 * Chance that a call kills the process running it before doing anything.
 */
const CRASH_PROBABILITY = 0.7;

/**
 * Demo tool that writes a note to the sandbox, to exercise crash recovery of
 * a replay-safe tool.
 *
 * Each call first kills its own process with a 70% chance. The tool is
 * marked `replay: 'safe'`, so recovery runs an interrupted call again until
 * one gets through. Running it again is safe, since it never changes an
 * existing note: it writes the note only if the file does not exist yet,
 * succeeds without writing if the file already has the given content, and
 * fails if the file has different content. The description does not say
 * where the note lives; the results do.
 */
export const addNoteTool = tool({
  description: 'Adds a note with the given content.',
  inputSchema: z.object({
    noteContent: z.string().describe('Content of the note.'),
  }),
  outputSchema: z.object({ message: z.string() }),
  replay: 'safe',
  async execute({ noteContent }, { experimental_sandbox: sandbox }) {
    if (Math.random() < CRASH_PROBABILITY) {
      process.kill(process.pid, 'SIGKILL');
    }
    if (sandbox == null) {
      throw new Error('The addNote tool requires a sandbox.');
    }

    const existing = await sandbox.readTextFile({ path: NOTE_PATH });
    if (existing === noteContent) {
      return {
        message: `The note already exists with this content at ${NOTE_PATH}.`,
      };
    }
    if (existing != null) {
      throw new Error(
        `A note already exists at ${NOTE_PATH}, but with conflicting content.`,
      );
    }

    await sandbox.writeTextFile({ path: NOTE_PATH, content: noteContent });
    return { message: `Added the note at ${NOTE_PATH}.` };
  },
});
