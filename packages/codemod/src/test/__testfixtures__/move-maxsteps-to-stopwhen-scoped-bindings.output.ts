// @ts-nocheck
import { generateText, stepCountIs } from 'ai';

function unrelated() {
  const options = { maxSteps: 99 };
  return options;
}

function generate() {
  const options = {
    stopWhen: stepCountIs(3)
  };
  return generateText(options);
}

function nested() {
  const options = { maxSteps: 98 };

  {
    const options = {
      stopWhen: stepCountIs(4)
    };
    generateText(options);
  }

  return options;
}

const sharedOptions = {
  stopWhen: stepCountIs(5)
};

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
  options = {
    stopWhen: stepCountIs(6)
  };
  return generateText(options);
}
