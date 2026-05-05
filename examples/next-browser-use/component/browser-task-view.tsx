import type { RunBrowserTaskUIToolInvocation } from '@/tool/run-browser-task-tool';

export default function BrowserTaskView({
  invocation,
}: {
  invocation: RunBrowserTaskUIToolInvocation;
}) {
  switch (invocation.state) {
    case 'input-streaming':
      return <pre>{JSON.stringify(invocation.input, null, 2)}</pre>;
    case 'input-available':
      return (
        <div className="text-gray-500">
          Starting browser task: {invocation.input.task}
        </div>
      );
    case 'output-available':
      return (
        <div className="text-gray-500">
          {invocation.output.state === 'running' ? (
            <span>
              [step {invocation.output.step}] {invocation.output.nextGoal} —{' '}
              {invocation.output.url}
            </span>
          ) : (
            <div>
              <div>
                Done in {invocation.output.stepCount} steps (status:{' '}
                {invocation.output.status}).
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {invocation.output.output}
              </pre>
            </div>
          )}
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
