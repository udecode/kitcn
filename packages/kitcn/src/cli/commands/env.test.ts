import { createDefaultConfig } from '../test-utils';
import { handleEnvCommand } from './env';

describe('cli/commands/env', () => {
  test('handleEnvCommand(push) accepts equals-form target flags', async () => {
    const pushEnvStub = mock(async () => {});

    await handleEnvCommand(
      ['env', 'push', '--deployment-name=my-deploy', '--env-file=.env.prod'],
      {
        loadCliConfig: (() => createDefaultConfig()) as any,
        syncEnv: pushEnvStub as any,
      }
    );

    expect(pushEnvStub).toHaveBeenCalledWith(
      expect.objectContaining({
        authSyncMode: 'auto',
        targetArgs: [
          '--deployment-name',
          'my-deploy',
          '--env-file',
          '.env.prod',
        ],
      })
    );
  });

  test('handleEnvCommand(pull) accepts equals-form target flags', async () => {
    const pullEnvStub = mock(async () => {});

    await handleEnvCommand(
      ['env', 'pull', '--preview-name=pr-139', '--out=.env.local'],
      {
        loadCliConfig: (() => createDefaultConfig()) as any,
        pullEnv: pullEnvStub as any,
      }
    );

    expect(pullEnvStub).toHaveBeenCalledWith({
      outFilePath: '.env.local',
      targetArgs: ['--preview-name', 'pr-139'],
    });
  });
});
