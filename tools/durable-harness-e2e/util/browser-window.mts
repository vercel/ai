const BROWSER_WINDOW_SIZE = '1600,1150';

/**
 * The `agent-browser` options for the command that launches the browser
 * session, so that every script shows the app in a headed window of the
 * same size. They only take effect when the browser launches.
 */
export const browserLaunchArgs = [
  '--headed',
  '--args',
  `--window-size=${BROWSER_WINDOW_SIZE}`,
];
