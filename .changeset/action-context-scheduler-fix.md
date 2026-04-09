---
"kitcn": patch
---

## Patches

- Improve mutation-driven action-caller guidance so `requireActionCtx()` points
  scheduler-capable flows to `requireSchedulerCtx()` and `caller.schedule.*`.
- Fix server-side call docs so mutation-or-action callbacks schedule actions
  instead of showing an invalid direct action call path.
