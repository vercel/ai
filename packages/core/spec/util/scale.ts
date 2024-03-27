export function scale({
  inputMin = 0,
  inputMax = 1,
  outputMin,
  outputMax,
  value,
}: {
  inputMin?: number;
  inputMax?: number;
  outputMin: number;
  outputMax: number;
  value: number | undefined;
}) {
  if (value === undefined) {
    return undefined;
  }

  const inputRange = inputMax - inputMin;
  const outputRange = outputMax - outputMin;
  return ((value - inputMin) * outputRange) / inputRange + outputMin;
}
