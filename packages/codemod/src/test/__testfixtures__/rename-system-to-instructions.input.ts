import { generateText } from 'ai';

declare const model: any;
declare const system: string;

const options: any = {
  model,
  system: 'hello',
  prompt: 'Hello',
  onStart: ({ system }: any) => {
    console.log(system);
  },
};

const staticComputedOptions = { ['system']: 'static' };
const dynamicComputedOptions = { [system]: 'dynamic' };
const { ['system']: staticSystem } = options;
const { [system]: dynamicSystem } = options;

console.log(staticComputedOptions, dynamicComputedOptions);
console.log(staticSystem, dynamicSystem);
console.log(options.system, options['system'], options[system]);

await generateText(options);
