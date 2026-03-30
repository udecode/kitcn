# PR #139 Remaining Review Threads

## Goal

Read all remaining PR review threads, fix only the valid issues, rerun the real
gate, then resolve the addressed threads with `gh`.

## Status

- [ ] Gather remaining unresolved review threads
- [ ] Triage validity and cluster actionable issues
- [ ] Implement valid fixes with tests
- [ ] Run `bun check`
- [ ] Resolve addressed threads on GitHub

## Notes

- Only fix valid threads.
- Do not resolve a thread unless the corresponding fix is actually in the
  branch.
