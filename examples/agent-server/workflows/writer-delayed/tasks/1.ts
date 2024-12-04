import { dataStreamTask } from '@ai-sdk/agent-server';
import { Context } from '../workflow';

export default dataStreamTask<Context>({
  async execute({ writer }) {
    writer.writeData({ status: 'analyzing message' });
    return { nextTask: '2' };
  },
});
