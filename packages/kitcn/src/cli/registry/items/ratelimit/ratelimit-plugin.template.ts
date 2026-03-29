const FUNCTIONS_DIR_IMPORT_PLACEHOLDER = '__KITCN_FUNCTIONS_DIR__';

export const RATELIMIT_PLUGIN_TEMPLATE = `import { getSessionNetworkSignals } from "kitcn/auth";
import { MINUTE, Ratelimit, RatelimitPlugin } from "kitcn/ratelimit";
import type { MutationCtx } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/server";

const fixed = (rate: number) => Ratelimit.fixedWindow(rate, MINUTE);

export const ratelimitBuckets = {
  default: {
    public: fixed(30),
    free: fixed(60),
    premium: fixed(200),
  },
} as const;

type RatelimitTier = keyof (typeof ratelimitBuckets)["default"];
export type RatelimitBucket = keyof typeof ratelimitBuckets;

type RatelimitUser = {
  id: string;
  isAdmin?: boolean;
  plan?: "premium" | "team" | null;
};

type RatelimitCtx = MutationCtx & {
  user?: RatelimitUser | null;
};

type RatelimitMeta = {
  ratelimit?: RatelimitBucket;
};

export function getUserTier(user: RatelimitUser | null): RatelimitTier {
  if (!user) {
    return "public";
  }
  if (user.isAdmin || user.plan) {
    return "premium";
  }

  return "free";
}

export const ratelimit = RatelimitPlugin.configure({
  buckets: ratelimitBuckets,
  getBucket: ({ meta }: { meta: RatelimitMeta }) => meta.ratelimit ?? "default",
  getUser: ({ ctx }: { ctx: RatelimitCtx }) => ctx.user ?? null,
  getIdentifier: ({ user }: { user: RatelimitUser | null }) =>
    user?.id ?? "anonymous",
  getTier: getUserTier,
  getSignals: ({ ctx }: { ctx: RatelimitCtx }) => getSessionNetworkSignals(ctx),
  prefix: ({ bucket, tier }) => \`ratelimit:\${bucket}:\${tier}\`,
  failureMode: "closed",
  enableProtection: true,
  denyListThreshold: 30,
});
`;
