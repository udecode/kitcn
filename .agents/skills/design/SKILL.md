---
description: Design and implement kitcn UI using live www/example tokens and primitives, accessible states, honest data formatting, and browser proof.
argument-hint: <route | component | surface> [review|implement]
name: design
metadata:
  skiller:
    source: .agents/rules/design.mdc
---

# Kitcn Design

Design from the live subject, data, and interaction. A polished shell around
fake states is not done.

## Read First

1. `VISION.md` and the named product/API source.
2. The live route and its data contract.
3. `www/app/global.css`, `www/components/ui/**`, and nearby documentation UI.
4. `example/src/app/globals.css`, `example/src/components/ui/**`, and the
   matching example feature.
5. Existing loading, empty, error, permission, and mutation states.

Treat live tokens and components as the palette. Do not introduce an isolated
design language in a feature file.

## Tokens And Primitives

- Use semantic color, spacing, radius, type, and motion tokens.
- Extend the token owner when a reusable need is real; do not hide raw values
  behind one-off aliases.
- Prefer existing shadcn-derived primitives and composition patterns.
- Change primitive behavior only when every consumer benefits.
- Keep docs and example variants consistent when they express the same product
  concept, while preserving their distinct runtime ownership.

## Subject And Hierarchy

Start with the user's decision:

- What is the primary object or action?
- Which facts change the decision?
- What is supporting context?
- What is optional detail?

One view gets one dominant hierarchy. Remove competing cards, repeated labels,
and decorative metadata that do not improve comprehension.

## Honest States

Design every state before declaring the happy path complete:

- initial/loading and background refresh;
- empty versus filtered-empty;
- missing setup or permission;
- inline validation and server rejection;
- mutation pending, success, partial failure, and retry;
- stale or unavailable external data;
- destructive confirmation and irreversible completion.

Do not render zero as missing, missing as zero, or inferred data as confirmed.
Label samples and previews. Preserve the user's input after failure.

## Accessibility

- Use semantic elements before ARIA.
- Give controls visible labels or accessible names.
- Keep keyboard order aligned with visual order.
- Provide focus visibility, escape behavior, and focus restoration for overlays.
- Announce important async success/error changes without noisy repetition.
- Do not encode status only by color.
- Respect reduced motion and usable target sizes.

## Copy And Formatting

- Use product language already established in docs and examples.
- Prefer direct verbs and concrete nouns.
- Explain consequences before destructive or expensive actions.
- Format dates, numbers, identifiers, and durations from typed values with the
  intended locale/timezone; do not pre-format them in the data layer.
- Empty copy should say what is absent and the useful next action.

## Motion

Motion explains state change. Keep it short, interruptible, and restrained.
Never delay the user's next action for decoration. Skeletons should preserve
layout; spinners belong to bounded operations.

## Process

1. Inspect the running surface and representative data.
2. Write the state and interaction matrix.
3. Reuse or adjust live tokens/primitives.
4. Implement the smallest coherent component ownership.
5. Test responsive, keyboard, reduced-motion, loading, empty, error, and
   permission states.
6. Use Browser for route/DOM/responsive/screenshot proof. Use Chrome or Computer
   only when native browser/OS behavior requires it.
7. Run focused tests and React review rules, then `autoreview`.

## Definition Of Done

- The real subject and primary action are obvious.
- All states are honest and actionable.
- Tokens and primitives have clear owners.
- Keyboard, focus, names, contrast, and motion are proven.
- No fake data or silent permission assumption is needed for the screenshot.
- Browser evidence covers the route and relevant breakpoints.
- Docs/example source ownership remains correct.
