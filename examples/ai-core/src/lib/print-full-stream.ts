import { StreamTextResult } from 'ai';

export async function printFullStream({
  result,
}: {
  result: StreamTextResult<any, any>;
}) {
  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log(
          `\n\x1b[32m\x1b[1mTOOL CALL:\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `\n\x1b[32m\x1b[1mTOOL RESULT:\x1b[22m\n${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'reasoning-start':
        process.stdout.write('\n\n\x1b[34m\x1b[1mREASONING:\x1b[22m\n');
        break;

      case 'reasoning-delta':
        process.stdout.write(chunk.text);
        break;

      case 'reasoning-end':
        process.stdout.write('\x1b[0m\n');
        break;

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
}
