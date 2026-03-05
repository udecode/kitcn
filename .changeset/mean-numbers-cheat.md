---
"better-convex": major
---

## Breaking changes

- Removed top-level `outputDir` from `better-convex` config.
- Shared API output path is now configured only through `paths.shared`.
- Config parsing is now strict: unknown top-level and nested keys throw validation errors.

```ts
// better-convex.config.ts
export default {
  paths: {
    lib: 'lib',
    shared: 'convex/shared',
  },
};
```

- CLI `--api <dir>` remains available as a runtime override for shared API output.
