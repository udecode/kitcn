const FUNCTIONS_DIR_IMPORT_PLACEHOLDER = '__KITCN_FUNCTIONS_DIR__';
const PROJECT_CRPC_IMPORT_PLACEHOLDER = '__KITCN_PROJECT_CRPC_IMPORT__';
const PROJECT_GET_ENV_IMPORT_PLACEHOLDER = '__KITCN_PROJECT_GET_ENV_IMPORT__';

export const RESEND_EMAIL_TEMPLATE = `'use node';

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import { z } from 'zod';
import { privateAction } from '${PROJECT_CRPC_IMPORT_PLACEHOLDER}';
${PROJECT_GET_ENV_IMPORT_PLACEHOLDER}
import { createResendCaller } from '${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/plugins/resend.runtime';

type GenericEmailTemplateProps = {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

function GenericEmailTemplate({
  title,
  body,
  ctaLabel,
  ctaUrl,
}: GenericEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', padding: '24px 0' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            margin: '0 auto',
            maxWidth: '600px',
            padding: '24px',
          }}
        >
          <Heading style={{ fontSize: '24px', margin: '0 0 12px' }}>
            {title}
          </Heading>
          <Text style={{ fontSize: '15px', lineHeight: '1.6', margin: '0' }}>
            {body}
          </Text>
          {ctaLabel && ctaUrl ? (
            <Section style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '6px',
                  color: '#ffffff',
                  display: 'inline-block',
                  fontSize: '14px',
                  padding: '10px 16px',
                  textDecoration: 'none',
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export const sendTemplatedEmail = privateAction
  .input(
    z.object({
      to: z.string(),
      from: z.string().optional(),
      subject: z.string(),
      title: z.string(),
      body: z.string(),
      ctaLabel: z.string().optional(),
      ctaUrl: z.string().optional(),
    })
  )
  .output(z.string())
  .action(async ({ ctx, input }) => {
    const from = input.from ?? getEnv().RESEND_FROM_EMAIL;
    if (!from) {
      throw new Error(
        'Missing sender email. Provide "from" or set RESEND_FROM_EMAIL.'
      );
    }

    const html = await render(
      <GenericEmailTemplate
        body={input.body}
        ctaLabel={input.ctaLabel}
        ctaUrl={input.ctaUrl}
        title={input.title}
      />
    );

    const caller = createResendCaller(ctx);
    return await caller.sendEmail({
      from,
      to: [input.to],
      subject: input.subject,
      html,
    });
  });
`;
