export default {
  resolveSnapshotPath: (testPath: string, snapshotExtension: string) =>
    testPath + snapshotExtension,
  resolveTestPath: (snapshotFilePath: string, snapshotExtension: string) =>
    snapshotFilePath.slice(0, -snapshotExtension.length),
  testPathForConsistencyCheck: 'some.test.js'
}
