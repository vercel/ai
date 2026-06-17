import { embed } from 'ai';

declare const model: any;
declare const value: string;

await embed({
  model,
  value,
  onEnd: () => {},
});
