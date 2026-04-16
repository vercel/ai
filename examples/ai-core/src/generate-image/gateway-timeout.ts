import { createGateway, experimental_generateImage } from 'ai';
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

    await experimental_generateImage({
      model: gateway.imageModel('bfl/flux-pro-1.1'),
      prompt: 'A serene mountain landscape at sunset',
    });
  } catch (error) {
    console.log(error);
  }
});
