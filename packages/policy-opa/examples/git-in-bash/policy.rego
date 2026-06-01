# Gate `git` whether the model calls a granular git tool directly or shells out
# through `bash` (vercel-labs/bash-tool). The dispatcher's `toInput` parses the
# bash command down to `{ kind, subcommand, args }`; this rule decides on that
# shape, so the same allowlist governs both surfaces.
#
# Posture: allow only read-only git, deny everything else. Anything the parser
# could not reduce to a single clean git invocation arrives as `kind: "bash"`
# and falls through to the default deny — bash is adversarial to parse, so
# "can't prove it's safe" means "deny".
package agent.action

import rego.v1

# Read-only git subcommands the agent may run.
git_read_only := {"status", "log", "diff", "show", "branch"}

# `git remote` is read-only on its own (and with `-v`/`show`), but these
# subcommands mutate remotes, so they are not.
remote_mutators := {"add", "remove", "rm", "set-url", "rename", "prune"}

# Default deny covers clone, push, pull, fetch, reset, and every `kind: "bash"`
# the parser refused to vouch for.
default decision := {"decision": "deny", "reason": "command not permitted by policy"}

decision := {"decision": "allow"} if {
	input.kind == "git"
	git_read_only[input.subcommand]
}

decision := {"decision": "allow"} if {
	input.kind == "git"
	input.subcommand == "remote"
	not remote_is_mutating
}

# True only when `git remote` carries a mutating subcommand. Undefined (not
# true) when `args` is empty or the first arg is read-only like `-v`, so the
# allow rule above lets `git remote` and `git remote -v` through.
remote_is_mutating if remote_mutators[input.args[0]]

decision := {"decision": "deny", "reason": msg} if {
	input.kind == "git"
	not git_read_only[input.subcommand]
	input.subcommand != "remote"
	msg := sprintf("git %s is not permitted (read-only git only)", [input.subcommand])
}
