import { runUsageSpoolIntegrationTest } from './usage-spool.test.js';
import { runResumeIntegrationTest } from './resume.test.js';
import { runTriggerUsageIntegrationTest } from './trigger-usage.test.js';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.ORBYT_ALLOW_NOOP_USAGE_COLLECTOR = '1';

  await runUsageSpoolIntegrationTest();
  await runResumeIntegrationTest();
  await runTriggerUsageIntegrationTest();

  console.log(JSON.stringify({
    ok: true,
    tests: [
      'usage-spool',
      'resume',
      'trigger-usage',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
