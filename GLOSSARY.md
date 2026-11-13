# Glossary

## Agents

- **Model**: A specific AI model that generates output, such as text, reasoning or tool calls, from the input it receives. Models are identified by an ID and accessed through a provider.
- **Provider:** A service that offers model access through an API.
- **Agent**: A configured unit that takes prompts and works toward a result over one or more steps, using a model and tools.
- **Harness**: A complete agent runtime with its own agent loop, built-in tools and conventions, often powered by an SDK or CLI.
- **Session**: A long-lived conversation between an application and an agent, which keeps history and state across many turns. A session is tied to one sandbox.
- **Turn**: The agent's full response to one prompt, from receiving it until it finishes, which can span many steps. Only one turn of a session runs at a time.
- **Step**: One model call within a turn, together with the tool calls it requested and their results. A turn ends once a step requests no more tool calls or the agent stops.
- **Prompt**: A user message that starts a new turn.
- **Steering message**: A user message sent while a turn is running, which the agent picks up at its next safe point instead of starting a new turn.
- **Instructions**: Standing guidance that shapes how the agent behaves across all turns, also called the system prompt.
- **Skill**: A packaged set of instructions and optional resources that the agent loads when a task needs them.
- **Tool**: A capability the model can call with structured input to act on the outside world or get information. A tool call produces a tool result that goes back to the model.
  - **Built-in tool**: A tool that ships with and is implemented by a harness, such as running shell commands or editing files. The concept only applies to harnesses: a model on its own (e.g. a raw model API call) has no built-in tools, and to the model, a harness's built-in tools are regular tools like any host tool.
  - **Host tool**: A tool the application defines itself, as opposed to a harness's built-in tools. The harness calls it, and it runs outside the harness, usually in the application's process.
  - **Client tool**: A host tool that runs on the agent's client, e.g. in the browser session that sends requests to the agent, instead of in the application's process. The client provides the tool result later.
- **Tool approval**: The decision to allow or deny a tool call before it runs, made by a policy or by a person.
- **Reasoning**: Text the model produces while thinking through a problem, separate from the response shown as the answer.
- **Sandbox**: An isolated environment, such as a virtual machine or container, where the agent runs commands and changes files without affecting the host.
  - **Sandbox session**: An open connection to a specific sandbox that can run commands and access files in it.
  - **Default working directory**: The directory that commands in a sandbox run in when no other directory is given, as set up by the sandbox itself.
  - **Work directory**: The directory inside the sandbox where the agent works on a session's files. It may be the same directory as the sandbox's default working directory, but conceptually it's separate and may be another directory, e.g. a subdirectory of the sandbox's default working directory.
- **Stream**: The append-only sequence of a session's output, which readers follow live or read back later.
- **Stream part**: One unit of the output an agent streams while it works, such as a piece of text, reasoning, a tool call or a tool result.
- **Finish reason**: Why a step or turn ended, such as a normal stop, a tool call, hitting a length limit, or an error.

## Durability

- **Durable execution**: Running an agent so that its progress is stored as it goes, so a session survives crashes, restarts and moves between processes.
- **Non-durable execution**: Running an agent with its progress kept only in memory, so the work of a running turn is lost if the process crashes, or by default also if it stops after a turn. To continue the agent session across processes after a turn, the progress so far has to be stored and then be fed back into the next process.
- **World**: The storage and infrastructure backend contract for durable execution, providing runs, event logs, streams and queues. Different worlds target different environments, such as local development or a hosted platform.
- **Run**: The unit of storage in a world that holds one session's log and stream.
- **Log**: The append-only, ordered record of everything that happened in a session, and the source of truth for its state. Anything not recorded in the log has not happened as far as recovery is concerned.
- **Log event**: One entry in the log, identified by a stable ID so the same event is never recorded twice.
- **Submission**: Any input an application sends into a session, such as a prompt or a steering message. A submission is recorded in the log first and delivered to the agent afterwards.
- **Delivery**: The moment the agent actually receives a submission, for example when a prompt is passed to the model. A submission that has not been delivered yet is waiting in the session.
- **Withdrawal**: Taking back a submission before it has been delivered to the agent. Once delivered, a submission can no longer be withdrawn.
- **Drive**: One pass of running a session in a process: reading its log, continuing whatever work is open, and stopping when the work is done or the drive has to stop. A turn can span several drives.
- **Effect**: A unit of work whose outcome is recorded in the log, such as a model call or a tool call, so it is never repeated by accident. When a later drive reaches a recorded effect again, it reuses the recorded outcome.
  - **Attempt**: One try at running an effect. An effect gets a new attempt only if an earlier one was interrupted in a way that allows a retry.
  - **Replay**: Running the agent again from its log, where recorded effects return their stored outcomes instead of running again. Replay is how a new drive gets back to where an earlier one stopped.
  - **Replay policy**: Whether an effect is safe to run again after an interruption, or must never run twice because it may already have taken effect (for example a command that changes files).
  - **Interruption**: An attempt that stopped before it produced an outcome, for example because its process crashed or its drive had to stop. An interruption can include partial output.
  - **Retryable**: Describes an interrupted attempt that may run again: its replay policy allows it, or it provably never started its work.
  - **Partial output**: The output an attempt produced before it was interrupted, recorded so it can be reported instead of lost.
- **Crash**: An unexpected end of the process running a drive, which leaves its open work unfinished.
- **Recovery**: What a new drive does after a crash: it records the abandoned attempts as interrupted, cleans up their output, and continues the session from the log.
- **Abandoned attempt**: An attempt that was started but never finished, whose drive is provably gone. An attempt is treated as abandoned only with proof that no living process can still finish it.
- **Deadline**: The point at which the platform terminates the process running a drive, for example the maximum duration of a serverless function. Once the deadline has passed, that drive is provably gone.
- **Yield**: A drive stopping on purpose before its deadline at a safe point, so the turn continues in a later drive.
- **Retraction**: Removing the stream parts of an interrupted attempt from a session's output, because a retry of the attempt replaces them. Consumers of the stream, such as a chat UI, drop the retracted parts they already received.
- **Background drive**: A drive started by the system instead of by a user request, for example from a queue message to continue a turn after a yield or crash.
- **Backstop**: A queue message sent when a drive starts and delayed until just past that drive's deadline, which starts a background drive of the same session. If the drive finished, the background drive finds nothing to do; if it yielded or crashed, the background drive continues the turn.
- **Queue**: The world's mechanism for scheduling future work, such as background drives, so it still happens when no request is waiting for it.
- **Fencing**: Preventing a drive that lost ownership of a session from making further changes, for example by having the sandbox refuse its operations.
