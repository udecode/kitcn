---
name: lfg
description: Full autonomous engineering workflow
argument-hint: '[feature description]'
---

Run these slash commands in order. Do not do anything else.

1. /workflows:plan $ARGUMENTS
2. /compound-engineering:deepen-plan: Context7: only query when not covered by skills
3. /workflows:work
   - Task loop: For UI tasks, run test-browser BEFORE marking complete (don't guess - verify visually)
   - Never mark UI task complete without browser verification
4. /changeset
5. /workflows:review
6. /compound-engineering:test-browser - only run if any browser-based features

Start with step 1 now.
