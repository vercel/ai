import { task } from '@ai-sdk/agent-server';
import { Context } from '../workflow';

export default task<Context>({
  async execute({ writeData }) {
    writeData({ status: 'analyzing message' });
    return { nextTask: '2' };
  },
});
