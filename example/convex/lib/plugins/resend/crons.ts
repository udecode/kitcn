import { cronJobs } from 'convex/server';
import { internal } from '../../../functions/_generated/api';

const crons = cronJobs();

crons.interval(
  'cleanup resend plugin emails',
  { hours: 1 },
  internal.plugins.resend.cleanupOldEmails,
  {}
);

crons.interval(
  'cleanup resend abandoned plugin emails',
  { hours: 6 },
  internal.plugins.resend.cleanupAbandonedEmails,
  {}
);

export default crons;
