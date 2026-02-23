import { createUser } from '../lib/auth/auth-helpers';
import { privateMutation } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import { createSeedCaller } from './generated/seed.runtime';

/**
 * Initialize the database on startup. This function runs automatically when
 * starting the dev server with --run init It checks if the database needs
 * seeding and runs the seed function if needed.
 */
export default privateMutation
  .meta({ dev: true })

  .mutation(async ({ ctx }) => {
    // Initialize admin user if configured
    const env = getEnv();
    const adminEmails = env.ADMIN;

    if (!adminEmails || adminEmails.length === 0) {
      return;
    }

    let isFirstInit = true;

    for (const adminEmail of adminEmails) {
      // Check if user exists in our app table by email
      const existingUser = await ctx.orm.query.user.findFirst({
        where: { email: adminEmail },
      });

      if (existingUser) {
        isFirstInit = false;
      } else {
        // Better Auth will link to this when they sign in
        await createUser(ctx, {
          email: adminEmail,
          name: 'Admin',
          role: 'admin',
        });
      }
    }

    if (isFirstInit && getEnv().DEPLOY_ENV === 'development') {
      // Run the seed function
      const caller = createSeedCaller(ctx);
      await caller.seed();
    }
  });
