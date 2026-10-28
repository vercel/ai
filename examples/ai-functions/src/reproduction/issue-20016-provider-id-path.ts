import { createAlibaba } from '@ai-sdk/alibaba';
import { run } from '../lib/run';

run(async () => {
  const provider = createAlibaba({
    apiKey: 'test-key',
    fetch: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      console.log('Requested path:', url.pathname);

      return Response.json({
        output: { task_id: 'test-task', task_status: 'RUNNING' },
      });
    },
  });
  const model = provider.video('wan2.1-t2v-turbo');

  if (model.doStatus == null) {
    throw new Error('Alibaba video model does not support status polling.');
  }

  for (const taskId of ['abc/../../internal', '.', '..']) {
    console.log('Task ID:', taskId);
    await model.doStatus({ operation: { taskId } });
  }
});
