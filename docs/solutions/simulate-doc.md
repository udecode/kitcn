# Better-Convex Documentation Test

## Objective

Test the kitcn documentation by building a working Next.js 15 app from scratch. Simulate a new developer with no prior kitcn knowledge.

## Rules

### Knowledge Boundaries

1. **Only use `kitcn/content/docs/`** as reference
2. **Convex native knowledge allowed** (official Convex patterns)
3. **When stuck, document the gap** - don't guess
4. Do not read anything outside `kitcn` folder.

### Error Tracking

Create `ERRORS.md` and log every issue:

```md
### Error N: [Title]

- **Location**: Doc page, step
- **Expected**: What docs said
- **Actual**: What happened
- **Resolution**: Workaround used
- **Doc Fix**: Suggested improvement
```

Log: missing steps, wrong code, missing imports, type errors, runtime errors, missing deps, broken links

### Process

1. Read docs first, then act
2. Follow docs literally - copy code exactly
3. Log confusion before proceeding
4. No silent fixes - log every doc gap

## Test Scope

Build a complete app following the docs. Exclude auth (separate test).

## Combination Strategy

Test one combo thoroughly first, then expand. Based on index.mdx "For AI Agents" options.

### Combo 1 (Current): Default Stack

| Choice | Value |
|--------|-------|
| Approach | Top-down (Templates) |
| Framework | Next.js App Router |
| Database | ctx.table (Ents) |
| Auth | None (excluded) |
| SSR/RSC | Yes |
| Triggers | Yes |

### Future Combos (after Combo 1 passes)

| # | Approach | Framework | DB | Auth | Notes |
|---|----------|-----------|-----|------|-------|
| 2 | Top-down | Next.js | ctx.db | None | Vanilla DB |
| 3 | Bottom-up | Vite | ctx.table | None | Non-Next.js |
| 4 | Bottom-up | Next.js | ctx.table | Better Auth | Auth test |
| 5 | Top-down | Vite | ctx.db | None | Minimal stack |

## Verification

- App runs
- Features work
- Real-time updates

## Success Criteria

### Combo 1
- [x] TypeScript passes
- [ ] App runs without errors
- [ ] Real-time updates work
- [ ] ERRORS.md documents all gaps

### Overall
- [ ] All combos tested
- [ ] Doc fixes applied

## Output

1. `ERRORS.md` - Issues found
2. Summary - Doc quality assessment
