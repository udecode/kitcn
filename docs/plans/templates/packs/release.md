# release pack

Use when verified work must close through package/repository release artifacts,
GitHub delivery, and check read-back.

Start Gates:
| Gate | Applies | Evidence |
| --- | --- | --- |
| Published package delta classified | pending | pending |
| Changeset owner selected or N/A | pending | pending |
| Package build/check path selected | pending | pending |
| GitHub PR expectation recorded | pending | pending |

Work Checklist:
- [ ] Release pack: changeset coverage matches every published package delta.
- [ ] Release pack: package build/types/tests and relevant fixtures/scenarios are
      recorded.
- [ ] Release pack: docs/package skill are current-state synchronized.
- [ ] Release pack: whole-checkout staging follows repository policy.
- [ ] Release pack: PR body, branch, checks, and final handoff agree.

Completion Gates:
| Gate | Applies | Required action | Evidence |
| --- | --- | --- | --- |
| Release artifact | pending | Add/update changeset or exact N/A reason | pending |
| Package proof | pending | Run owning build/types/tests | pending |
| Repository check | yes | Run `bun check` before PR | pending |
| Commit/push/PR | pending | Deliver and read back PR/check state | pending |
