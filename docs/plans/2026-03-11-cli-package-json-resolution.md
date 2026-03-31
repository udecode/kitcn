# Fix packed CLI package.json resolution and persist init backend

## Goal
1. Fix built `kitcn` CLI so package scripts like `kitcn codegen` work from scaffolded apps.
2. Persist the selected init backend in scaffolded `kitcn.json`, so `init --backend concave` keeps using Concave afterward.

## Plan
1. Inspect source of version/package resolution in CLI.
2. Write failing regression test for built-path package metadata resolution.
3. Fix resolution to work from both source and bundled dist output.
4. Add a red test for `init --backend concave` writing top-level `backend`.
5. Wire the resolved backend into config bootstrap.
6. Verify with targeted tests and a real `fixtures/next` codegen run.

## Progress
- [x] Plan file created
- [x] Inspect source
- [x] Red test
- [x] Fix
- [x] Verify
