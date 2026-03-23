# 2026-03-22 concave public startup check

## Goal

Verify whether Concave actually has a general startup readiness gap, or whether the problem is only internal runtime function execution.

## Plan

1. Re-read the current documented finding for the internal/runtime seam.
2. Use a prepared scenario app with a known public function.
3. Start local Concave dev and invoke a public function immediately from another process.
4. Compare that with the internal-function behavior and report the real conclusion.

## Progress

- 2026-03-22: started live check of public vs internal function behavior on local Concave dev.
- 2026-03-22: public `messages:list` only failed with connection refusal before
  the socket was up, then succeeded on the next attempt with HTTP 200. No
  transient function-level rejection.
