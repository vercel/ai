// @ts-nocheck
import { generateText } from 'ai';

function unrelated() {
  const options = { maxSteps: 99 };
  return options;
}

function generate() {
  const options = { maxSteps: 3 };
  return generateText(options);
}

function nested() {
  const options = { maxSteps: 98 };

  {
    const options = { maxSteps: 4 };
    generateText(options);
  }

  return options;
}

const sharedOptions = { maxSteps: 5 };

function generateWithSharedOptions() {
  return generateText(sharedOptions);
}

function unrelatedAssignment() {
  let options;
  options = { maxSteps: 97 };
  return options;
}

function generateWithAssignment() {
  let options;
  options = { maxSteps: 6 };
  return generateText(options);
}
