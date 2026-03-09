const FUNCTIONS_DIR_IMPORT_PLACEHOLDER = '__BETTER_CONVEX_FUNCTIONS_DIR__';

export const RESEND_CRONS_TEMPLATE = `import { cronJobs } from "convex/server";
import { internal } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup resend plugin emails",
  { hours: 1 },
  internal.plugins.resend.cleanupOldEmails,
  {},
);

crons.interval(
  "cleanup resend abandoned plugin emails",
  { hours: 6 },
  internal.plugins.resend.cleanupAbandonedEmails,
  {},
);

export default crons;
`;
