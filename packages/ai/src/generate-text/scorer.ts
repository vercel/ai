export type Scorer<T = any> = {
  name: string;
  tool: string;
  scorer: (output: T) => number;
};

export type ScorerResult = {
  name: Scorer['name'];
  tool: Scorer['tool'];
  result: number;
};

export function createScorer<T>(scorer: {
  name: string;
  tool: string;
  scorer: (output: T) => number;
}): Scorer<T> {
  return scorer;
}

export function executeScorer<T>(scorer: Scorer<T>['scorer'], output: T) {
  return scorer(output);
}
