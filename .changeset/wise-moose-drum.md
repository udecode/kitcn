---
"better-convex": minor
---

## Breaking changes

- Drop Better Auth `1.4` support and align auth integrations with Better Auth `1.5.3` and `@convex-dev/better-auth@0.11.1`.
- Remove bundled passkey schema assumptions and follow the upstream `oauthApplication.redirectUrls` rename during `0.11` migrations.

```ts
// Before
"better-auth": "1.4.9";
"@convex-dev/better-auth": "0.10.11";

oauthApplication: {
  redirectURLs: ["https://example.com/callback"];
}

// After
"better-auth": "1.5.3";
"@convex-dev/better-auth": "0.11.1";

oauthApplication: {
  redirectUrls: ["https://example.com/callback"];
}
```

## Patches

- Improve Next.js server-side token forwarding by forcing `accept-encoding: identity` for internal auth fetches behind proxy compression.
- Fix auth adapter selection and OR-query handling so `id` selects preserve `_id`, nullish filters behave correctly, unsupported `experimental.joins` are rejected, and OR updates/deletes/counts dedupe by document id.
- Improve auth route origin handling by filtering nullish `trustedOrigins` values before CORS matching.
