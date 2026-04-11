import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { WorkflowLoader } from '../../loader/WorkflowLoader.js';
import { WorkflowParser } from '../../parser/WorkflowParser.js';
import { OrbytEngine } from '../../core/OrbytEngine.js';
import type { ParsedWorkflow } from '../../types/core-types.js';

interface ConversionResult {
  file: string;
  output: string;
  valid: boolean;
  error?: string;
}

async function convertAndValidateYamlExamples(): Promise<void> {
  const examplesDir = resolve(process.cwd(), '../cli/examples');
  const outputDir = resolve(process.cwd(), '.orbt-output');
  const engine = new OrbytEngine();

  mkdirSync(outputDir, { recursive: true });

  const yamlFiles = readdirSync(examplesDir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort();

  if (yamlFiles.length === 0) {
    console.log('[convert-yaml-to-orbt] No YAML files found.', { examplesDir });
    return;
  }

  const results: ConversionResult[] = [];

  for (const yamlFile of yamlFiles) {
    const inputPath = resolve(examplesDir, yamlFile);
    const outputPath = resolve(outputDir, `${basename(yamlFile, yamlFile.endsWith('.yml') ? '.yml' : '.yaml')}.orbt`);

    try {
      const workflowObject: ParsedWorkflow = await WorkflowLoader.toWorkflowObject(inputPath);

      // Write .orbt object file for manual inspection.
      writeFileSync(outputPath, JSON.stringify(workflowObject, null, 2), 'utf-8');

      // Validate converted object file contents through parser.
      WorkflowParser.parse(workflowObject);
      await engine.validate(workflowObject);

      results.push({
        file: yamlFile,
        output: outputPath,
        valid: true,
      });
    } catch (error) {
      results.push({
        file: yamlFile,
        output: outputPath,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = results.filter((r) => r.valid);
  const failed = results.filter((r) => !r.valid);

  console.log('[convert-yaml-to-orbt] Summary', {
    examplesDir,
    outputDir,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
  });

  for (const result of results) {
    if (result.valid) {
      console.log(`PASS ${result.file} -> ${result.output}`);
    } else {
      console.log(`FAIL ${result.file} -> ${result.output}`);
      console.log(`  ${result.error}`);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

convertAndValidateYamlExamples().catch((error) => {
  console.error('[convert-yaml-to-orbt] Fatal error', error);
  process.exitCode = 1;
});
