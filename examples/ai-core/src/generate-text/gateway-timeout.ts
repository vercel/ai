import { createGateway, generateText } from 'ai';
import { Agent, fetch as undiciFetch } from 'undici';
import { run } from '../lib/run';

run(async () => {
  try {
    const gateway = createGateway({
      fetch: (
        url: string | URL | Request,
        options?: RequestInit,
      ): Promise<Response> => {
        // @ts-expect-error - undici types are outdated and don't include dispatcher option
        return undiciFetch(url as Parameters<typeof undiciFetch>[0], {
          ...options,
          dispatcher: new Agent({
            headersTimeout: 1,
            bodyTimeout: 1,
          }),
        }) as Promise<Response>;
      },
    });

    await generateText({
      model: gateway('anthropic/claude-sonnet-4.5'),
      prompt:
        'Write a detailed essay about the history of artificial intelligence, covering major milestones from the 1950s to present day.',
    });
  } catch (error) {
    console.log(error);
  }
});
