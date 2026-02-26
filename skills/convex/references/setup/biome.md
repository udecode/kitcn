## Biome / Lint Setup

One-time config. Enforces import boundaries between `src/`, `convex/`, and `convex/shared/`.

### Install

```bash
bun add -D @biomejs/biome ultracite
```

### Architecture: 3-Layer Import Boundary

```
src/ ──(alias @convex/*)──> convex/shared/ ──(type-only)──> convex/functions/generated/
  ✗ convex/functions/          ✗ convex/lib/
  ✗ convex/lib/                ✗ convex/routers/
  ✗ convex/* packages          ✗ convex/functions/*
```

Rationale:

1. **`src/` → `convex/shared/`**: Client code reads shared types via `@convex/*` alias. Cannot reach `convex/functions/` or `convex/lib/` (server-only).
2. **`convex/` → `convex/`**: Backend files cannot import from `src/`.
3. **`convex/shared/`**: Strictest — client-importable, so no lib/routers/functions imports. Only type-only imports from `generated/auth` (via biome-ignore).

### File Exclusions

```jsonc
"files": {
  "includes": [
    "!**/_generated",   // Convex auto-generated (raw types)
    "!**/generated",    // better-convex codegen (ORM-wrapped types)
    "!**/convex/shared/api.ts"  // generated shared API
  ]
}
```

Both `_generated/` and `generated/` are excluded from all linting — rules only apply to user-written files.

### Key Rules

#### `_generated/server` is forbidden

All convex files must import from `generated/server` (ORM-wrapped types) instead of `_generated/server` (raw Convex types):

- `QueryCtx`, `MutationCtx`, `ActionCtx` — wrapped with ORM context
- `initCRPC` — prewired with `DataModel` and ORM context
- `orm`, `withOrm` — ORM instance

Exception: `generated/server.ts` itself imports from `_generated/server` (excluded from linting).

#### `ConvexError` is forbidden

Use `CRPCError` from `better-convex/crpc` instead of `ConvexError` from `convex/values`.

#### `convex/react` and `convex/nextjs` are forbidden in `src/`

- Use `useCRPC` from `@/lib/convex/crpc` instead of `convex/react`.
- Use `caller` from `@/lib/convex/rsc` or `createContext().caller` from `@/lib/convex/server` instead of `convex/nextjs`.

#### `convex/shared/` cannot import from `convex/functions/`

Exception: type-only imports from `generated/auth` need `biome-ignore`:

```ts
// biome-ignore lint/style/noRestrictedImports: types
import type { getAuth } from '../functions/generated/auth';
```

### Adding Exceptions

Use `biome-ignore` inline comments for legitimate rule violations:

```ts
// biome-ignore lint/style/noRestrictedImports: types
import type { ActionCtx } from './_generated/server';
```

### Full Config

```jsonc
{
  "extends": ["ultracite/core", "ultracite/react", "ultracite/next"],
  "files": {
    "includes": [
      "!**/_generated",
      "!**/generated",
      "!**/convex/shared/api.ts"
    ]
  },
  "overrides": [
    {
      // src/ cannot import from convex/* packages directly
      "includes": ["src/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "convex/values": {
                    "importNames": ["ConvexError"],
                    "message": "Use CRPCError from 'better-convex/crpc' instead."
                  },
                  "convex/react": "Use useCRPC from '@/lib/convex/crpc' instead.",
                  "convex/nextjs": "Use caller from '@/lib/convex/rsc' or createContext({ headers }).caller from '@/lib/convex/server' instead."
                },
                "patterns": [{
                  "group": ["**/../convex/**"],
                  "message": "Use @convex/* alias instead of relative convex imports."
                }]
              }
            }
          }
        }
      }
    },
    {
      // convex/ cannot import from src/ or _generated/server
      "includes": ["convex/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "convex/values": {
                    "importNames": ["ConvexError"],
                    "message": "Use CRPCError from 'better-convex/crpc' instead."
                  }
                },
                "patterns": [
                  {
                    "group": ["@/*", "**/src/**"],
                    "message": "Convex files cannot import from src/."
                  },
                  {
                    "group": ["**/_generated/server*"],
                    "message": "Use convex/functions/generated/server instead of _generated/server."
                  }
                ]
              }
            }
          }
        }
      }
    },
    {
      // convex/shared/ is client-importable, so restrict its imports
      "includes": ["convex/shared/**/*.ts*"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@/*", "**/src/**"],
                    "message": "Convex files cannot import from src/."
                  },
                  {
                    "group": ["**/convex/lib/**", "../lib/**"],
                    "message": "convex/shared cannot import from convex/lib."
                  },
                  {
                    "group": ["**/convex/routers/**", "../routers/**"],
                    "message": "convex/shared cannot import from convex/routers."
                  },
                  {
                    "group": ["**/_generated/server*"],
                    "message": "Use convex/functions/generated/server instead of _generated/server."
                  },
                  {
                    "group": ["**/../functions/*"],
                    "message": "convex/shared cannot import from convex/functions."
                  }
                ]
              }
            }
          }
        }
      }
    }
  ]
}
```

