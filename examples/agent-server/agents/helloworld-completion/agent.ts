import type { Agent } from '@ai-sdk/agent-server/types/agent';

export default class HelloWorldAgent implements Agent {
  async init() {
    console.log('Hello, world!');
  }
}
