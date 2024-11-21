import type { Agent } from '@ai-sdk/agent-server';

export default class HelloWorldAgent implements Agent {
  async init() {
    console.log('Hello, world!');
  }
}
