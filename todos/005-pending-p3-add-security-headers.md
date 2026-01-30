---
status: pending
priority: p3
issue_id: "005"
tags: [security, headers, csp, best-practice]
dependencies: []
---

# Add Security Headers for Theme Preference Protection

## Problem Statement

The application lacks Content Security Policy and other security headers that could protect against XSS attacks through theme values or other client-side injection points.

**Impact:** Reduced defense-in-depth. While no active vulnerability exists, missing security headers leave application more exposed to potential attacks.

## Findings

**Source:** security-sentinel agent review

**Evidence:**
- No CSP headers configured
- No X-Content-Type-Options header
- No X-Frame-Options header
- Theme value stored in localStorage without additional protection
- Next.js defaults don't include strict security headers

**Risk Level:** MEDIUM
- No immediate vulnerability
- Defense-in-depth missing
- Industry best practice not followed

## Proposed Solutions

### Option 1: Add next.config.js Security Headers (Recommended)
Configure Next.js to include security headers in responses.

**Pros:**
- Standard Next.js approach
- Protects entire application
- Easy to configure and maintain
- No runtime overhead

**Cons:**
- Requires careful CSP policy crafting
- May break inline scripts if too strict
- Needs testing across all pages

**Effort:** Medium (1 hour including testing)
**Risk:** Medium (could break existing inline scripts)

**Implementation:**
```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

### Option 2: Use Middleware for Headers
Add security headers via Next.js middleware.

**Pros:**
- More flexible than next.config
- Can conditionally apply headers
- Easier to modify per-route

**Cons:**
- Runs on every request (slight overhead)
- More complex than config approach
- Middleware runs for all routes

**Effort:** Medium (1.5 hours)
**Risk:** Low

### Option 3: Deploy-Time Configuration
Configure headers at CDN/reverse proxy level.

**Pros:**
- Doesn't touch application code
- Centralized security policy
- No app deployment needed

**Cons:**
- Requires infrastructure access
- Not version controlled with app
- Varies by deployment platform

**Effort:** Medium (varies by platform)
**Risk:** Low

## Recommended Action

_(To be filled during triage)_

## Technical Details

**Affected Files:**
- `example/next.config.mjs` - Add headers configuration
- OR `example/src/middleware.ts` - Add middleware approach

**Security Headers to Add:**
- **CSP:** Prevent XSS attacks
- **X-Content-Type-Options:** Prevent MIME sniffing
- **X-Frame-Options:** Prevent clickjacking
- **X-XSS-Protection:** Enable browser XSS filter

## Acceptance Criteria

- [ ] Security headers present in HTTP responses
- [ ] CSP policy allows necessary scripts/styles
- [ ] All pages load correctly with headers
- [ ] Security scanner shows improved score
- [ ] No console warnings from CSP violations

## Work Log

### 2026-01-30 - Initial Finding

**By:** security-sentinel agent

**Actions:**
- Audited HTTP response headers
- Identified missing security headers
- Proposed implementation approaches

**Learnings:**
- Security headers are defense-in-depth
- Next.js doesn't add strict headers by default
- CSP requires careful policy crafting

## Resources

- **PR:** (to be added)
- **Related Issues:** #65
- **Next.js Docs:** https://nextjs.org/docs/app/api-reference/next-config-js/headers
- **OWASP:** https://owasp.org/www-project-secure-headers/
- **CSP Guide:** https://content-security-policy.com/
