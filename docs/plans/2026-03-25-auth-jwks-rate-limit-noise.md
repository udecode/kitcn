# 2026-03-25 auth jwks rate limit noise

## Goal

Remove the Better Auth local warning on Convex auth JWKS requests without
forcing app-level config.

## Plan

- confirm the warning source and Better Auth contract
- add a failing package test for default auth rate-limit rules
- implement the package-level auth default merge
- verify with targeted tests, package build/typecheck, and live local proof

## Findings

- warning comes from Better Auth's own rate limiter, not better-convex
  ratelimit
- the noisy path is `/convex/jwks`
- Better Auth supports `rateLimit.customRules[path] = false`
- package-level runtime merge is the clean seam; it fixes existing apps too
