import type { ResendApi } from './index';

const assertResendApi = (_value: ResendApi) => undefined;

assertResendApi({
  apiKey: '',
  webhookSecret: '',
  initialBackoffMs: 30_000,
  retryAttempts: 5,
  testMode: true,
});
