---
title: Concave codegen must load root .env for parse-time module imports
date: 2026-04-08
category: integration-issues
module: cli-codegen
problem_type: integration_issue
component: tooling
symptoms:
  - `kitcn dev` or `kitcn codegen` aborts while parsing modules that call `getEnv()`
  - Concave apps with `SECRET` in root `.env` still fail parse-time env validation with `received undefined`
  - the same app works at runtime once the backend is actually running
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - concave
  - codegen
  - dev
  - env
  - getEnv
  - parse-time
---

# Concave codegen must load root .env for parse-time module imports

## Problem

`kitcn dev` and `kitcn codegen` can import user modules before the Concave
backend is running.

If those modules call `getEnv()` at import time, parse-time env validation must
see the app's local `.env` values or codegen dies before runtime starts.

## Symptoms

- `Invalid input: expected string, received undefined` for required env keys
- failure appears under `kitcn codegen aborted because module parsing failed`
- the app stores the missing secret in root `.env`, not `convex/.env`

## What Didn't Work

- treating this like the older Convex auth-env sync bug; deployment env was not
  the problem here
- only loading `convex/.env` around `generateMeta()`
- fixing `createEnv()` itself instead of the CLI parse wrapper

## Solution

Use one parse-time env wrapper for codegen/dev:

1. read both root `.env` and `convex/.env`
2. let backend decide precedence
3. wrap `generateMeta()` with that env snapshot in both `codegen` and `dev`

For Concave, root `.env` wins so parse-time module imports can read the same
values the app uses at runtime.

## Why This Works

The bug lived outside the env helper.

`createEnv()` already reads `process.env` during codegen parse mode, but the CLI
was only preloading `convex/.env` in one codegen path and not at all in `dev`.
That worked for Convex-local auth flows, but Concave users commonly keep server
secrets in root `.env`.

Loading the right local env files before `generateMeta()` means module imports
see the same env snapshot regardless of whether they are parsed from `kitcn dev`
or `kitcn codegen`.

## Prevention

- Parse-time module imports are part of the CLI contract, not just runtime
- Keep `dev` and `codegen` on the same local env-loading wrapper
- For Concave, test required `getEnv()` reads from root `.env`, not only
  `convex/.env`
