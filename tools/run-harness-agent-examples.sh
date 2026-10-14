#!/usr/bin/env bash
#
# Run harness-agent examples from examples/ai-functions/src/harness-agent.
#
# Usage:
#   tools/run-harness-agent-examples.sh [--harness <name>...] [--example <name>...] [--auth <mode>]
#
# Flags (all optional, repeatable, combinable):
#   --harness <name>   Only run examples for the given harness folder(s)
#                      (e.g. --harness grok-build). Defaults to all harnesses.
#   --example <name>   Only run the named example(s) across selected harnesses.
#                      <name> is the file name without the .ts extension
#                      (e.g. --example with-instructions). Defaults to all.
#   --auth <mode>      Force an auth mode for every example invocation by
#                      setting HARNESS_FORCE_AUTH=<mode> inline. Accepted
#                      values: "direct", "ai-gateway". Unset by default.
#
# Every example file must import a `create*()` function from the `_create.ts`
# helper in its own harness folder. An example missing the required import is
# not run and reported as ERROR.
#
# By default every *.ts example in every harness folder is run (slow!).
# Only direct children of a harness folder are treated as examples; nested
# subfolders (e.g. codex-acp/locked-acquisition/) are skipped. Files whose
# name begins with an underscore (e.g. _shared-helpers.ts) are helpers and
# are never run; --example rejects such names outright.
#
# The working directory is always restored to its original value on exit,
# regardless of success, failure, or unexpected errors.

set -euo pipefail

# --- Paths -----------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXAMPLES_DIR="${REPO_ROOT}/examples/ai-functions"
HARNESS_DIR="${EXAMPLES_DIR}/src/harness-agent"
ORIGINAL_PWD="$(pwd)"

# --- Colors ----------------------------------------------------------------

if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  RESET='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  RESET=''
fi

# --- Argument parsing ------------------------------------------------------

SELECTED_HARNESSES=()
SELECTED_EXAMPLES=()
AUTH_MODE=''

while [ $# -gt 0 ]; do
  case "$1" in
    --harness)
      shift
      if [ $# -eq 0 ]; then
        echo "Error: --harness requires a value" >&2
        exit 2
      fi
      SELECTED_HARNESSES+=("$1")
      shift
      ;;
    --example)
      shift
      if [ $# -eq 0 ]; then
        echo "Error: --example requires a value" >&2
        exit 2
      fi
      case "$1" in
        _*)
          echo "Error: --example must not start with '_' (underscore-prefixed files are helpers, not examples): '$1'" >&2
          exit 2
          ;;
      esac
      SELECTED_EXAMPLES+=("$1")
      shift
      ;;
    --auth)
      shift
      if [ $# -eq 0 ]; then
        echo "Error: --auth requires a value" >&2
        exit 2
      fi
      case "$1" in
        direct|ai-gateway)
          AUTH_MODE="$1"
          ;;
        *)
          echo "Error: --auth must be 'direct' or 'ai-gateway' (got '$1')" >&2
          exit 2
          ;;
      esac
      shift
      ;;
    -h|--help)
      sed -n '3,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Run with --help for usage." >&2
      exit 2
      ;;
  esac
done

# `set -u` interacts badly with empty arrays on bash 3.2 (macOS default).
# This expansion is a no-op for empty arrays and expands normally otherwise.
HARNESS_COUNT=${#SELECTED_HARNESSES[@]}
EXAMPLE_COUNT=${#SELECTED_EXAMPLES[@]}

# --- Directory restore -----------------------------------------------------

restore_pwd() {
  cd "${ORIGINAL_PWD}" 2>/dev/null || true
}
trap restore_pwd EXIT

# --- Discover harnesses ----------------------------------------------------

# Harness folders are direct subdirectories of HARNESS_DIR that contain at
# least one runnable *.ts example. Files beginning with an underscore are
# excluded everywhere (helpers, not examples), as are loose helpers outside
# harness folders. Sorted for stable output.

ALL_HARNESSES=()
if [ -d "${HARNESS_DIR}" ]; then
  while IFS= read -r line; do
    ALL_HARNESSES+=("${line}")
  done < <(
    find "${HARNESS_DIR}" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null |
      while IFS= read -r dir; do
        if [ -n "$(find "${dir}" -mindepth 1 -maxdepth 1 -type f -name '*.ts' ! -name '_*' -print -quit 2>/dev/null)" ]; then
          basename "${dir}"
        fi
      done |
      sort
  )
fi

# --- Select harnesses ------------------------------------------------------

HARNESS_TO_RUN=()
if [ "${HARNESS_COUNT}" -gt 0 ]; then
  for requested in ${SELECTED_HARNESSES[@]+"${SELECTED_HARNESSES[@]}"}; do
    found=0
    for available in ${ALL_HARNESSES[@]+"${ALL_HARNESSES[@]}"}; do
      if [ "${requested}" = "${available}" ]; then
        found=1
        break
      fi
    done
    if [ "${found}" -eq 0 ]; then
      echo "Error: harness '${requested}' not found." >&2
      echo "Available harnesses:" >&2
      for available in ${ALL_HARNESSES[@]+"${ALL_HARNESSES[@]}"}; do
        echo "  - ${available}" >&2
      done
      exit 2
    fi
    HARNESS_TO_RUN+=("${requested}")
  done
else
  for available in ${ALL_HARNESSES[@]+"${ALL_HARNESSES[@]}"}; do
    HARNESS_TO_RUN+=("${available}")
  done
fi

if [ "${#HARNESS_TO_RUN[@]}" -eq 0 ]; then
  echo "No harness folders found under ${HARNESS_DIR}" >&2
  exit 1
fi

# --- Results collection ----------------------------------------------------

# A temp file accumulates "harness|example|STATUS" rows; sorted at the end.
RESULTS_FILE="$(mktemp -t harness-results)"
STDERR_DIR="$(mktemp -d -t harness-stderr)"
trap 'rm -f "${RESULTS_FILE}"; rm -rf "${STDERR_DIR}"; restore_pwd' EXIT

record_result() {
  printf '%s|%s|%s\n' "$1" "$2" "$3" >>"${RESULTS_FILE}"
}

# --- Run examples ----------------------------------------------------------

# When examples are explicitly requested, a missing example file is reported
# as NOT FOUND rather than treated as an error. Otherwise every *.ts file in
# the harness folder is run.

cd "${EXAMPLES_DIR}"

run_example() {
  local stderr_file="$2"
  if [ -n "${AUTH_MODE}" ]; then
    FAIL_ON_ERROR=1 HARNESS_FORCE_AUTH="${AUTH_MODE}" pnpm tsx "$1" 2> >(tee "${stderr_file}" >&2)
  else
    FAIL_ON_ERROR=1 pnpm tsx "$1" 2> >(tee "${stderr_file}" >&2)
  fi
}

# Build the breakdown annotation for a failed example from its captured stderr:
# first line, collapsed whitespace, truncated at 50 characters with an ellipsis
# appended when it is longer.
fail_annotation() {
  local line
  line="$(grep -m1 . "$1" 2>/dev/null || true)"
  line="$(printf '%s' "${line}" | tr -s '[:space:]' ' ' | tr '|' '/')"
  if [ "${#line}" -gt 50 ]; then
    printf '%s…' "$(printf '%s' "${line}" | cut -c1-50)"
  else
    printf '%s' "${line}"
  fi
}

# An example must initialize its harness through the folder's custom
# `create*()` wrapper (`_create.ts`), so that HARNESS_FORCE_AUTH is honored.
example_uses_custom_create() {
  grep -qE "import \{[^}]*\bcreate[A-Za-z]+\b[^}]*\} from '\./_create'" "$1"
}

total=0
pass=0
fail=0
error=0
notfound=0

for harness in ${HARNESS_TO_RUN[@]+"${HARNESS_TO_RUN[@]}"}; do
  harness_path="${HARNESS_DIR}/${harness}"

  if [ "${EXAMPLE_COUNT}" -gt 0 ]; then
    # Explicit example list: run each requested example, or record NOT FOUND.
    for example in ${SELECTED_EXAMPLES[@]+"${SELECTED_EXAMPLES[@]}"}; do
      example_file="${harness_path}/${example}.ts"
      if [ ! -f "${example_file}" ]; then
        record_result "${harness}" "${example}" "NOT FOUND"
        notfound=$((notfound + 1))
        total=$((total + 1))
        continue
      fi

      echo
      echo "▶ ${harness}/${example}"
      echo "──────────────────────────────────────────────────────────"
      if ! example_uses_custom_create "${example_file}"; then
        record_result "${harness}" "${example}" "ERROR (example is not using the custom \`create*()\` function)"
        error=$((error + 1))
      elif run_example "src/harness-agent/${harness}/${example}.ts" "${STDERR_DIR}/${harness}-${example}.log"; then
        record_result "${harness}" "${example}" "PASS"
        pass=$((pass + 1))
      else
        record_result "${harness}" "${example}" "FAIL ($(fail_annotation "${STDERR_DIR}/${harness}-${example}.log"))"
        fail=$((fail + 1))
      fi
      total=$((total + 1))
    done
  else
    # No explicit examples: run every runnable *.ts file in the harness
    # folder (underscore-prefixed files are helpers, not examples).
    example_files=()
    while IFS= read -r example_file; do
      example_files+=("${example_file}")
    done < <(
      find "${harness_path}" -mindepth 1 -maxdepth 1 -type f -name '*.ts' ! -name '_*' -print |
        sort
    )
    for example_file in ${example_files[@]+"${example_files[@]}"}; do
      example="$(basename "${example_file}" .ts)"
      echo
      echo "▶ ${harness}/${example}"
      echo "──────────────────────────────────────────────────────────"
      if ! example_uses_custom_create "${example_file}"; then
        record_result "${harness}" "${example}" "ERROR (example is not using the custom \`create*()\` function)"
        error=$((error + 1))
      elif run_example "src/harness-agent/${harness}/${example}.ts" "${STDERR_DIR}/${harness}-${example}.log"; then
        record_result "${harness}" "${example}" "PASS"
        pass=$((pass + 1))
      else
        record_result "${harness}" "${example}" "FAIL ($(fail_annotation "${STDERR_DIR}/${harness}-${example}.log"))"
        fail=$((fail + 1))
      fi
      total=$((total + 1))
    done
  fi
done

# --- Breakdown -------------------------------------------------------------

echo
echo
echo "Breakdown"
echo "──────────────────────────────────────────────────────────"
sort -t '|' -k1,1 -k2,2 "${RESULTS_FILE}" | while IFS='|' read -r harness example status; do
  case "${status}" in
    PASS)
      status_colored="${GREEN}PASS${RESET}"
      ;;
    FAIL*)
      status_colored="${RED}FAIL${RESET} ${status#FAIL }"
      ;;
    ERROR*)
      status_colored="${RED}ERROR${RESET} ${status#ERROR }"
      ;;
    'NOT FOUND')
      status_colored="${YELLOW}NOT FOUND${RESET}"
      ;;
    *)
      status_colored="${status}"
      ;;
  esac
  printf -- '- %s/%s: %b\n' "${harness}" "${example}" "${status_colored}"
done

echo
echo "Total: ${total} | Pass: ${pass} | Fail: ${fail} | Error: ${error} | Not found: ${notfound}"

if [ "${fail}" -gt 0 ] || [ "${error}" -gt 0 ]; then
  exit 1
fi
exit 0
