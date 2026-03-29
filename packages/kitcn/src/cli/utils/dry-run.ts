import type { PluginInstallPlan } from '../types.js';

export const serializeDryRunPlan = (plan: PluginInstallPlan) => {
  return {
    ...plan,
    dependency: {
      packageName: plan.dependency.packageName,
      packageSpec: plan.dependency.packageSpec,
      packageJsonPath: plan.dependency.packageJsonPath?.replaceAll('\\', '/'),
      installed: plan.dependency.installed,
      skipped: plan.dependency.skipped,
      reason: plan.dependency.reason,
    },
  };
};
