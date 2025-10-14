import { anthropic } from '@ai-sdk/anthropic';
import { UIToolInvocation } from 'ai';

export default function AnthropicCodeExecutionView({
  invocation,
}: {
  invocation: UIToolInvocation<
    ReturnType<typeof anthropic.tools.codeExecution_20250825>
  >;
}) {
  switch (invocation.state) {
    case 'input-streaming':
    case 'input-available': {
      return <InputView input={invocation.input} />;
    }
    case 'output-available':
      return (
        <>
          <InputView input={invocation.input} />

          <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
            <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
              {invocation.output.type === 'bash_code_execution_result' && (
                <>
                  <span className="font-semibold">Stdout:</span>
                  <br />
                  {invocation.output.stdout}
                  <br />
                  {invocation.output.stderr && (
                    <>
                      <span className="font-semibold">Stderr:</span>
                      <br />
                      {invocation.output.stderr}
                      <br />
                    </>
                  )}
                  {invocation.output.return_code != null && (
                    <>
                      <span className="font-semibold">Return Code:</span>
                      <br />
                      {invocation.output.return_code}
                      <br />
                    </>
                  )}
                </>
              )}
              {invocation.output.type ===
                'text_editor_code_execution_create_result' && (
                <>
                  <span className="font-semibold">File Create Result</span>
                  <br />
                  <span className="font-semibold">Is File Update:</span>{' '}
                  {invocation.output.is_file_update ? 'Yes' : 'No'}
                  <br />
                </>
              )}
            </pre>
          </div>
        </>
      );
  }
}

function InputView({
  input,
}: {
  input: UIToolInvocation<
    ReturnType<typeof anthropic.tools.codeExecution_20250825>
  >['input'];
}) {
  switch (input?.type) {
    case 'text_editor_code_execution': {
      switch (input.command) {
        case 'view': {
          return (
            <div className="mb-2 text-gray-100 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
              <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
                <span className="font-semibold">Text Editor (View)</span>
                {input.path && (
                  <>
                    <span className="font-semibold">File Path:</span>{' '}
                    {input.path}
                    <br />
                  </>
                )}
              </pre>
            </div>
          );
        }
        case 'create': {
          return (
            <div className="mb-2 text-gray-100 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
              <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
                <span className="font-semibold">Text Editor (Create)</span>
                {input.path && (
                  <>
                    <span className="font-semibold">File Path:</span>{' '}
                    {input.path}
                    <br />
                  </>
                )}
                {input.file_text && (
                  <>
                    <span className="font-semibold">File Text:</span>{' '}
                    {input.file_text}
                    <br />
                  </>
                )}
              </pre>
            </div>
          );
        }
        case 'str_replace': {
          return (
            <div className="mb-2 text-gray-100 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
              <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
                <span className="font-semibold">Text Editor (Replace)</span>
                {input.path && (
                  <>
                    <span className="font-semibold">File Path:</span>{' '}
                    {input.path}
                    <br />
                  </>
                )}
                {input.old_str && (
                  <>
                    <span className="font-semibold">Old String:</span>{' '}
                    {input.old_str}
                    <br />
                  </>
                )}
                {input.new_str && (
                  <>
                    <span className="font-semibold">New String:</span>{' '}
                    {input.new_str}
                    <br />
                  </>
                )}
              </pre>
            </div>
          );
        }
      }
    }

    case 'bash_code_execution': {
      const command = input.command;

      return (
        <div className="mb-2 bg-gray-600 rounded-xl border border-gray-900 shadow-lg">
          <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap">
            <span className="font-semibold">Bash</span>
            <br />
            {command && (
              <>
                <span className="font-semibold">Command:</span> {command}
                <br />
              </>
            )}
          </pre>
        </div>
      );
    }
  }
}
