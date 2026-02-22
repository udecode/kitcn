import { z } from 'zod';
import { createUser } from '../lib/auth/auth-helpers';
import { privateMutation } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import { createCaller } from './generated';

/**
 * Initialize the database on startup. This function runs automatically when
 * starting the dev server with --run init It checks if the database needs
 * seeding and runs the seed function if needed.
 */
export default privateMutation
  .meta({ dev: true })
  .output(z.null())
  .mutation(async ({ ctx }) => {
    console.log('Initializing database');

    // Initialize admin user if configured
    const env = getEnv();
    const adminEmails = env.ADMIN;

    console.log('Admin emails', adminEmails);

    if (!adminEmails || adminEmails.length === 0) {
      return null;
    }

    let isFirstInit = true;

    for (const adminEmail of adminEmails) {
      // Check if user exists in our app table by email
      const existingUser = await ctx.orm.query.user.findFirst({
        where: { email: adminEmail },
      });

      console.log('Existing user', existingUser);

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
      const caller = createCaller(ctx);
      await caller.seed.seed();
    }

    return null;
  });
