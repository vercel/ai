import { type StreamTextResult } from 'ai';
import { sanitizeTerminalText } from '../tui/sanitize-terminal-text';

export async function printStream(result: StreamTextResult<any, any, any>) {
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-start':
        process.stdout.write('\x1b[94m\n');
        break;
      case 'reasoning-delta':
        process.stdout.write(
          sanitizeTerminalText(part.text, { multiline: true }),
        );
        break;
      case 'reasoning-end':
        process.stdout.write('\x1b[0m\n\n');
        break;
      case 'text-delta':
        process.stdout.write(
          sanitizeTerminalText(part.text, { multiline: true }),
        );
        break;
      case 'tool-call':
        process.stdout.write(
          `\x1b[92mtool-call: ${sanitizeTerminalText(JSON.stringify(part))}\x1b[0m\n\n`,
        );
        break;
      case 'tool-result':
        process.stdout.write(
          `\x1b[92mtool-result: ${sanitizeTerminalText(JSON.stringify(part))}\x1b[0m\n\n`,
        );
        break;
    }
  }
}
