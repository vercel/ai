// @ts-nocheck
import { experimental_StreamData } from 'ai';
import { experimental_StreamData as StreamDataLegacy } from 'other-pkg';

// Should rename - class extension
class CustomStream extends experimental_StreamData {
  // Custom implementation
}

// Should rename - type usage
const createStream = (): experimental_StreamData => {
  return new experimental_StreamData();
};

// Should rename - instance check
const isStreamData = (obj: unknown): obj is experimental_StreamData => {
  return obj instanceof experimental_StreamData;
};

// Should NOT rename - different package
class OtherStream extends StreamDataLegacy {
  // Custom implementation
}
