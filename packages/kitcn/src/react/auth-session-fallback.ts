'use client';

const SESSION_TOKEN_FALLBACK_KEY = 'kitcn.auth.session-token';
const SESSION_DATA_FALLBACK_KEY = 'kitcn.auth.session-data';

const getSessionStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const readAuthSessionFallbackToken = () => {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const token = storage.getItem(SESSION_TOKEN_FALLBACK_KEY);
  return token && token.length > 0 ? token : null;
};

export const writeAuthSessionFallbackToken = (token: string | null) => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  if (token && token.length > 0) {
    storage.setItem(SESSION_TOKEN_FALLBACK_KEY, token);
    return;
  }

  storage.removeItem(SESSION_TOKEN_FALLBACK_KEY);
};

export const readAuthSessionFallbackData = () => {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const value = storage.getItem(SESSION_DATA_FALLBACK_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const writeAuthSessionFallbackData = (data: unknown) => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  if (data === null || data === undefined) {
    storage.removeItem(SESSION_DATA_FALLBACK_KEY);
    return;
  }

  storage.setItem(SESSION_DATA_FALLBACK_KEY, JSON.stringify(data));
};

export const clearAuthSessionFallback = () => {
  writeAuthSessionFallbackToken(null);
  writeAuthSessionFallbackData(null);
};
