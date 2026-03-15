import { runNodeEnvSmoke } from './node-env-smoke';
import { FULL_CONVEX_SCENARIO_KEYS } from './scenario.config';
import { checkScenario } from './scenarios';

const main = async () => {
  for (const scenarioKey of FULL_CONVEX_SCENARIO_KEYS) {
    await checkScenario(scenarioKey);
  }

  await runNodeEnvSmoke();
};

if (import.meta.main) {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
