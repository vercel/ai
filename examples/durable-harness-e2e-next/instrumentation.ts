export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startDriveQueue } = await import('./lib/start-drive-queue');
  await startDriveQueue();
}
