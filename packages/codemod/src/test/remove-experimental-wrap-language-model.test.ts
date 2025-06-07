import { defineInlineTest } from 'jscodeshift/src/testUtils';
import transform from '../codemods/remove-experimental-wrap-language-model';

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { experimental_wrapLanguageModel } from 'ai';

const wrappedModel = experimental_wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});
  `,
  `
import { wrapLanguageModel } from 'ai';

const wrappedModel = wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});
  `,
  'should rename experimental_wrapLanguageModel import and usage',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { experimental_wrapLanguageModel as wrapModel } from 'ai';

const wrapped = wrapModel({
  model: openai('gpt-4'),
  middleware: {}
});
  `,
  `
import { wrapLanguageModel as wrapModel } from 'ai';

const wrapped = wrapModel({
  model: openai('gpt-4'),
  middleware: {}
});
  `,
  'should handle aliased imports correctly',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateText, experimental_wrapLanguageModel } from 'ai';

const model = experimental_wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});

const result = generateText({ model });
  `,
  `
import { generateText, wrapLanguageModel } from 'ai';

const model = wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});

const result = generateText({ model });
  `,
  'should handle mixed imports from ai package',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { experimental_wrapLanguageModel } from 'ai';
import { experimental_wrapLanguageModel as otherWrap } from 'other-package';

const aiWrapped = experimental_wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});

const otherWrapped = otherWrap();
  `,
  `
import { wrapLanguageModel } from 'ai';
import { experimental_wrapLanguageModel as otherWrap } from 'other-package';

const aiWrapped = wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {}
});

const otherWrapped = otherWrap();
  `,
  'should only transform imports from ai package, not other packages',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { experimental_wrapLanguageModel } from 'ai';

function createWrapper() {
  return experimental_wrapLanguageModel;
}

const wrapper = experimental_wrapLanguageModel;
const result = wrapper({ model: openai('gpt-4'), middleware: {} });
  `,
  `
import { wrapLanguageModel } from 'ai';

function createWrapper() {
  return wrapLanguageModel;
}

const wrapper = wrapLanguageModel;
const result = wrapper({ model: openai('gpt-4'), middleware: {} });
  `,
  'should handle function assignments and references',
);
