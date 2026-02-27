---
title: Ratelimit component gaps and recommended mitigations
date: 2026-02-27
type: analysis
---

# Ratelimit component gaps and recommended mitigations

## Context
This document captures known pain points from community references and Convex team responses, and records mitigation guidance that should be reflected in `better-convex/plugins/ratelimit` docs.

## Gaps

### 1. Application-layer limiting does not eliminate request-invocation billing risk
- A rejected request still invoked a function.
- This protects downstream expensive work but does not provide network-layer shielding.

### 2. Component invocation overhead and duplicate subquery reads
- Current component calls are isolated per component invocation.
- Repeated `check/getValue` style calls in one parent invocation can duplicate document access.

### 3. No built-in network-layer controls in application code
- IP/firewall/websocket-disconnect style controls are network/proxy concerns, not application-layer rate-limit concerns.
- Ratelimit logic alone is not equivalent to DDoS protection.

## Convex team guidance (summarized)
- Use auth-first gating and short-circuit expensive operations as early as possible.
- For stronger IP/network controls, place Cloudflare (or equivalent) proxy in front of traffic where appropriate.
- For anonymous flows, prefer captcha + validated session IDs over raw client-generated IDs.
- Add monitoring/alerts for traffic anomalies and use support escalation when antagonistic traffic appears.

## Explicit non-goals for `better-convex/plugins/ratelimit`
- Not a network firewall.
- Not a DDoS mitigation service.
- Not a zero-cost invocation shield.

## Package direction
- Keep application-layer control deterministic and transactional.
- Fail closed by default.
- Provide high-DX API parity and local read dedupe to avoid unnecessary repeated state reads in one invocation.
