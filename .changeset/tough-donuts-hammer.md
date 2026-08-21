---
"kitcn": patch
---

## Patches

- Speed up `kitcn analyze` by measuring every selected entry in one bundler pass
  instead of one pass per entry: 4.3 s → 0.8 s of bundling on the 24-entry example
  app, with byte-identical `OutMB`. Each entry is still sized as its own
  independently tree-shaken isolate, so the ranking is unchanged.
- Report the hotspot `DepMB` and `Files` columns for the files that carry weight in
  each entry's isolate. They previously counted every file the bundler parsed,
  including files tree-shaking dropped entirely, which disagreed with the `--details`
  package and input tables directly beneath them. Expect both columns to read lower
  than before for the same code; `OutMB` and `LocMB` are unaffected.
- Fix `kitcn analyze` crashing with a bundler stack trace when a Convex entry fails
  to build. It now lists the entry under `Failed entries:`, keeps reporting every
  entry that did build, and still exits `1`. This needs esbuild `0.27.7`, which is
  now the minimum.
- Warn which entries had their `./schema` imports externalized after a build error,
  instead of leaving the default mode silent about approximate dependency sizes. The
  approximation is applied per entry, so one unbuildable schema import no longer
  shrinks the numbers for unrelated functions.
- Open the interactive analyzer's package and input panes without a second bundle, so
  moving the selection no longer pauses to rebuild.
- Document the hotspot ranking columns, in `--help` and in the CLI reference, along
  with the `--top-inputs` / `--top-packages` flags.
