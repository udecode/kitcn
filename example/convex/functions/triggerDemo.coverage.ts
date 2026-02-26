export type TriggerCoverageStatus =
  | 'supported'
  | 'partial'
  | 'blocked'
  | 'missing';

export type TriggerCoverageId =
  | 'create-before-normalization'
  | 'create-before-cancel'
  | 'create-after-side-effects'
  | 'update-before-normalization'
  | 'update-before-cancel'
  | 'update-after-side-effects'
  | 'delete-before-cancel'
  | 'delete-after-side-effects'
  | 'change-hook-all-ops'
  | 'recursive-write-queue'
  | 'innerdb-bypass'
  | 'user-create-after-bootstrap'
  | 'session-create-after-bootstrap';

export type TriggerCoverageDefinition = {
  id: TriggerCoverageId;
  feature: string;
  status: TriggerCoverageStatus;
  reason: string;
  example: string;
  errorCode?: string;
};

export const TRIGGER_COVERAGE_DEFINITIONS: readonly TriggerCoverageDefinition[] =
  [
    {
      id: 'create-before-normalization',
      feature: 'create.before payload normalization',
      status: 'supported',
      reason: 'before() can rewrite incoming data before persistence.',
      example:
        'triggerDemoRecord.create.before -> trim name + lowercase email + defaults',
    },
    {
      id: 'create-before-cancel',
      feature: 'create.before cancellation',
      status: 'supported',
      reason: 'return false cancels write with TriggerCancelledError.',
      example:
        "triggerDemoRecord.create.before -> return false when name is ''",
      errorCode: 'TriggerCancelledError',
    },
    {
      id: 'create-after-side-effects',
      feature: 'create.after side effects',
      status: 'supported',
      reason: 'after() can fan out deterministic writes after commit.',
      example:
        'triggerDemoRecord.create.after -> append audit + bump stats row',
    },
    {
      id: 'update-before-normalization',
      feature: 'update.before payload normalization',
      status: 'supported',
      reason: 'update.before can sanitize partial updates consistently.',
      example: 'triggerDemoRecord.update.before -> trim name + lowercase email',
    },
    {
      id: 'update-before-cancel',
      feature: 'update.before cancellation',
      status: 'supported',
      reason: 'invalid update payloads are rejected pre-write.',
      example:
        "triggerDemoRecord.update.before -> return false when next name is ''",
      errorCode: 'TriggerCancelledError',
    },
    {
      id: 'update-after-side-effects',
      feature: 'update.after side effects',
      status: 'supported',
      reason: 'update.after can emit side effects for successful updates.',
      example: 'triggerDemoRecord.update.after -> append audit + bump stats',
    },
    {
      id: 'delete-before-cancel',
      feature: 'delete.before cancellation',
      status: 'supported',
      reason: 'delete.before can enforce guardrails before destructive writes.',
      example:
        'triggerDemoRecord.delete.before -> block delete when deleteGuard=true',
      errorCode: 'TriggerCancelledError',
    },
    {
      id: 'delete-after-side-effects',
      feature: 'delete.after side effects',
      status: 'supported',
      reason: 'delete.after runs after successful delete operations.',
      example: 'triggerDemoRecord.delete.after -> append audit + bump stats',
    },
    {
      id: 'change-hook-all-ops',
      feature: 'change hook across insert/update/delete',
      status: 'supported',
      reason: 'change(change, ctx) runs for every successful operation.',
      example: "triggerDemoRecord.change -> append 'change' audit for each op",
    },
    {
      id: 'recursive-write-queue',
      feature: 'recursive writes from hooks',
      status: 'supported',
      reason: 'ctx.db writes inside hooks enqueue deterministically.',
      example:
        'create.after -> ctx.db.patch(...) triggers queued update lifecycle pass',
    },
    {
      id: 'innerdb-bypass',
      feature: 'innerDb bypasses recursive dispatch',
      status: 'supported',
      reason: 'ctx.innerDb writes bypass trigger recursion.',
      example:
        "create.after -> ctx.innerDb.patch('triggerDemoRecord', ...) does not emit change:update",
    },
    {
      id: 'user-create-after-bootstrap',
      feature: 'app user.create.after bootstrap',
      status: 'supported',
      reason:
        'user.create.after provisions personal organization + owner membership + active org pointers.',
      example: 'user.create.after in schema.ts',
    },
    {
      id: 'session-create-after-bootstrap',
      feature: 'app session.create.after bootstrap',
      status: 'partial',
      reason:
        'session.create.after backfills activeOrganizationId from user defaults; direct ORM probe reports matched=true/false for visibility.',
      example: 'session.create.after in schema.ts',
    },
  ] as const;
