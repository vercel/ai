import { flag } from '@vercel/flags/next';
import { generateText } from 'ai';

// in most larger application, there will be a registry file with the models (see e.g. v0)
import { registry } from '../registry';

const promptFlag = flag({
  key: 'specific-prompt-name',
  async decide() {
    // anything could be implemented here. it needs to return the values
    // in a format that the template abstraction defines, i.e. a json object
    // with special properties for model, settings, prompt
    // (including handlebars string for parameterized
    // prompt, system, messages properties)
    return getLaunchDarklyClient().variation(this.key, false);
  },
});

const result = await generateText({
  // new: template property on functions, because:
  //
  // having a separate key allows for mixing & matching of properties
  // and enables people to incrementally migrate to edge config / flags
  //
  // the template return an async object that can contain settings,
  // model, and prompts
  //
  // the generic type is optional and types the input values to the template
  // that come from the application flow
  template: vercelEdgeTemplate<{
    language: 'French' | 'Spanish' | 'German';
    sentence: string;
  }>({
    // flag will be resolved and the output values will be used to set up
    // the model, settings, and prompt (depending on what is defined in edge config)
    flag: promptFlag,

    // pass in model registry to enable model lookup via string ids:
    // (could have inline option in addition to this)
    models: registry,

    // input values that are passed into the template for resolution:
    // (important, we absolutely need this parameterization)
    input: {
      language: 'French',
      sentence: 'Hello, how are you?',
    },
  }),
  // example property override (mix & match):
  temperature: 0.5,
  // other properties that are unlikely to be in the template:
  tools: [
    // ...
  ],
});
