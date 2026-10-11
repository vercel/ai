import { generateText } from 'ai';

declare const model: any;
declare const system: string;

const options: any = {
  model,
  instructions: 'hello',
  prompt: 'Hello',
  onStart: ({ instructions: system }: any) => {
    console.log(system);
  },
};

const staticComputedOptions = { ['instructions']: 'static' };
const dynamicComputedOptions = { [system]: 'dynamic' };
const { ['instructions']: staticSystem } = options;
const { [system]: dynamicSystem } = options;

console.log(staticComputedOptions, dynamicComputedOptions);
console.log(staticSystem, dynamicSystem);
console.log(options.instructions, options['instructions'], options[system]);

await generateText(options);
