import resend from '@convex-dev/resend/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(resend);

export default app;
