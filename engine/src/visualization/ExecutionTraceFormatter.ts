import type { ParsedWorkflow, StepResult, WorkflowResult } from '../types/core-types.js';
import {
	ExecutionGraphBuilder,
	type ExecutionGraphModel,
	type VisualizationNode,
} from './ExecutionGraphBuilder.js';

export interface ExecutionTraceStep {
	readonly stepId: string;
	readonly uses: string;
	readonly status: StepResult['status'] | 'unknown';
	readonly phase?: number;
	readonly dependencies: readonly string[];
	readonly dependents: readonly string[];
	readonly durationMs?: number;
	readonly attempts?: number;
	readonly startedAt?: string;
	readonly completedAt?: string;
	readonly error?: string;
}

export interface ExecutionTraceDocument {
	readonly workflow: {
		readonly name: string;
		readonly version?: string;
		readonly executionId?: string;
		readonly status?: WorkflowResult['status'];
		readonly startedAt?: string;
		readonly completedAt?: string;
		readonly durationMs?: number;
	};
	readonly summary: {
		readonly totalSteps: number;
		readonly totalEdges: number;
		readonly totalPhases: number;
		readonly maxParallelism: number;
		readonly hasCycle: boolean;
		readonly successfulSteps: number;
		readonly failedSteps: number;
		readonly skippedSteps: number;
		readonly timeoutSteps: number;
	};
	readonly phases: ReadonlyArray<{
		readonly phase: number;
		readonly stepIds: readonly string[];
	}>;
	readonly steps: readonly ExecutionTraceStep[];
	readonly cyclePath?: readonly string[];
	readonly mermaid: string;
}

export class ExecutionTraceFormatter {
	static toDocument(
		workflow: ParsedWorkflow,
		result?: WorkflowResult,
	): ExecutionTraceDocument {
		const graph = ExecutionGraphBuilder.fromWorkflow(workflow, result);
		const stepResultMap = result?.stepResults;

		const steps = graph.nodes
			.map((node) => this.toTraceStep(node, stepResultMap))
			.sort((left, right) => {
				const leftPhase = left.phase ?? Number.MAX_SAFE_INTEGER;
				const rightPhase = right.phase ?? Number.MAX_SAFE_INTEGER;
				if (leftPhase !== rightPhase) {
					return leftPhase - rightPhase;
				}
				return left.stepId.localeCompare(right.stepId);
			});

		const success = steps.filter((step) => step.status === 'success').length;
		const failure = steps.filter((step) => step.status === 'failure').length;
		const skipped = steps.filter((step) => step.status === 'skipped').length;
		const timeout = steps.filter((step) => step.status === 'timeout').length;

		return {
			workflow: {
				name: graph.workflowName,
				version: graph.workflowVersion,
				executionId: result?.executionId,
				status: result?.status,
				startedAt: result?.startedAt.toISOString(),
				completedAt: result?.completedAt.toISOString(),
				durationMs: result?.duration,
			},
			summary: {
				totalSteps: graph.summary.totalSteps,
				totalEdges: graph.summary.totalEdges,
				totalPhases: graph.summary.totalPhases,
				maxParallelism: graph.summary.maxParallelism,
				hasCycle: graph.hasCycle,
				successfulSteps: success,
				failedSteps: failure,
				skippedSteps: skipped,
				timeoutSteps: timeout,
			},
			phases: graph.phases.map((phase) => ({
				phase: phase.phase,
				stepIds: [...phase.stepIds],
			})),
			steps,
			cyclePath: graph.cyclePath,
			mermaid: this.toMermaid(graph),
		};
	}

	static toText(workflow: ParsedWorkflow, result?: WorkflowResult): string {
		const doc = this.toDocument(workflow, result);

		const lines: string[] = [];
		lines.push('Execution Trace');
		lines.push('================');
		lines.push(`Workflow: ${doc.workflow.name}`);
		if (doc.workflow.executionId) {
			lines.push(`Execution ID: ${doc.workflow.executionId}`);
		}
		if (doc.workflow.status) {
			lines.push(`Status: ${doc.workflow.status}`);
		}
		if (doc.workflow.durationMs !== undefined) {
			lines.push(`Duration: ${doc.workflow.durationMs}ms`);
		}
		lines.push(`Steps: ${doc.summary.totalSteps}`);
		lines.push(`Phases: ${doc.summary.totalPhases}`);
		lines.push(`Max Parallelism: ${doc.summary.maxParallelism}`);
		lines.push('');

		if (doc.summary.hasCycle && doc.cyclePath) {
			lines.push(`Cycle Detected: ${doc.cyclePath.join(' -> ')}`);
			lines.push('');
		}

		for (const phase of doc.phases) {
			lines.push(`Phase ${phase.phase}: ${phase.stepIds.join(', ')}`);
			for (const stepId of phase.stepIds) {
				const step = doc.steps.find((entry) => entry.stepId === stepId);
				if (!step) {
					continue;
				}

				let detail = `  - ${step.stepId} (${step.uses}) status=${step.status}`;
				if (step.durationMs !== undefined) {
					detail += ` duration=${step.durationMs}ms`;
				}
				if (step.attempts !== undefined) {
					detail += ` attempts=${step.attempts}`;
				}
				if (step.error) {
					detail += ` error="${step.error}"`;
				}
				lines.push(detail);
			}
		}

		if (doc.phases.length === 0 && doc.steps.length > 0) {
			lines.push('Steps:');
			for (const step of doc.steps) {
				lines.push(`  - ${step.stepId} (${step.uses}) status=${step.status}`);
			}
		}

		return lines.join('\n');
	}

	static toMermaid(graph: ExecutionGraphModel): string {
		const lines: string[] = ['flowchart TD'];

		for (const node of graph.nodes) {
			const label = this.escapeMermaidLabel(`${node.label}\\n${node.uses}`);
			lines.push(`  ${this.toMermaidId(node.id)}["${label}"]`);
		}

		for (const edge of graph.edges) {
			lines.push(`  ${this.toMermaidId(edge.from)} --> ${this.toMermaidId(edge.to)}`);
		}

		if (graph.hasCycle && graph.cyclePath && graph.cyclePath.length > 1) {
			for (let index = 0; index < graph.cyclePath.length - 1; index++) {
				const from = this.toMermaidId(graph.cyclePath[index]);
				const to = this.toMermaidId(graph.cyclePath[index + 1]);
				lines.push(`  ${from} -. cycle .-> ${to}`);
			}
		}

		return lines.join('\n');
	}

	private static toTraceStep(
		node: VisualizationNode,
		resultMap: WorkflowResult['stepResults'] | undefined,
	): ExecutionTraceStep {
		const stepResult = resultMap?.get(node.id);

		return {
			stepId: node.id,
			uses: node.uses,
			status: stepResult?.status ?? 'unknown',
			phase: node.phase,
			dependencies: [...node.dependencies],
			dependents: [...node.dependents],
			durationMs: stepResult?.duration,
			attempts: stepResult?.attempts,
			startedAt: stepResult?.startedAt.toISOString(),
			completedAt: stepResult?.completedAt.toISOString(),
			error: stepResult?.error?.message,
		};
	}

	private static toMermaidId(raw: string): string {
		return `N_${raw.replace(/[^a-zA-Z0-9_]/g, '_')}`;
	}

	private static escapeMermaidLabel(label: string): string {
		return label.replace(/"/g, '\\"');
	}
}
