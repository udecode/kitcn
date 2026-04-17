const TRAILING_SLASH_RE = /\/$/;

export const resolveConvexTokenPath = (basePath?: string) => {
  const normalizedBasePath =
    basePath && basePath !== '/'
      ? basePath.replace(TRAILING_SLASH_RE, '')
      : '/api/auth';
  return `${normalizedBasePath}/convex/token`;
};

export const isTokenExpired = (
  exp: number | undefined,
  expirationToleranceSeconds = 60,
  now = Math.floor(Date.now() / 1000)
) => {
  if (!exp) {
    return true;
  }
  return now >= exp - expirationToleranceSeconds;
};
