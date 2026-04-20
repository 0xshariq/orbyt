import { createExecutionNode } from '../execution/ExecutionNode.js';
import {
	CycleDetector,
	DependencyResolver,
	TopologicalSorter,
} from '../graph/DependencyGraph.js';
import type {
	ParsedStep,
	ParsedWorkflow,
	StepResult,
	WorkflowResult,
} from '../types/core-types.js';

export interface VisualizationNode {
	readonly id: string;
	readonly label: string;
	readonly uses: string;
	readonly dependencies: readonly string[];
	readonly dependents: readonly string[];
	readonly phase?: number;
	readonly isEntryPoint: boolean;
	readonly isExitPoint: boolean;
	readonly status?: StepResult['status'];
	readonly durationMs?: number;
	readonly attempts?: number;
	readonly error?: string;
}

export interface VisualizationEdge {
	readonly from: string;
	readonly to: string;
	readonly kind: 'depends_on';
}

export interface VisualizationPhase {
	readonly phase: number;
	readonly stepIds: readonly string[];
}

export interface ExecutionGraphModel {
	readonly workflowName: string;
	readonly workflowVersion?: string;
	readonly executionId?: string;
	readonly nodes: readonly VisualizationNode[];
	readonly edges: readonly VisualizationEdge[];
	readonly phases: readonly VisualizationPhase[];
	readonly entryPoints: readonly string[];
	readonly exitPoints: readonly string[];
	readonly hasCycle: boolean;
	readonly cyclePath?: readonly string[];
	readonly summary: {
		readonly totalSteps: number;
		readonly totalEdges: number;
		readonly totalPhases: number;
		readonly maxParallelism: number;
	};
}

export class ExecutionGraphBuilder {
	static fromWorkflow(
		workflow: ParsedWorkflow,
		result?: WorkflowResult,
	): ExecutionGraphModel {
		const executionNodes = workflow.steps.map((step) => this.toExecutionNode(step));
		const graph = DependencyResolver.resolve(executionNodes);
		const cycle = CycleDetector.detect(graph);

		const sortResult = cycle.hasCycle ? undefined : TopologicalSorter.sort(graph);
		const stepPhases = sortResult?.stepPhases;
		const entryPoints = DependencyResolver.getEntryPoints(graph);
		const exitPoints = DependencyResolver.getExitPoints(graph);

		const nodes = Array.from(graph.nodes.values())
			.map((node) => {
				const stepResult = result?.stepResults.get(node.stepId);
				return this.buildVisualizationNode(
					node.stepId,
					node.uses,
					node.dependencies,
					graph.reverseDependencies.get(node.stepId) || [],
					stepPhases?.get(node.stepId),
					entryPoints.includes(node.stepId),
					exitPoints.includes(node.stepId),
					stepResult,
				);
			})
			.sort((left, right) => left.id.localeCompare(right.id));

		const edges: VisualizationEdge[] = graph.edges
			.map((edge) => ({
				// Convert to dependency flow direction: dependency -> dependent
				from: edge.to,
				to: edge.from,
				kind: 'depends_on' as const,
			}))
			.sort((left, right) => {
				const byFrom = left.from.localeCompare(right.from);
				return byFrom !== 0 ? byFrom : left.to.localeCompare(right.to);
			});

		const phases: VisualizationPhase[] = sortResult
			? sortResult.phases.map((stepIds, index) => ({
					phase: index,
					stepIds: [...stepIds],
				}))
			: [];

		const maxParallelism = phases.reduce(
			(max, phase) => Math.max(max, phase.stepIds.length),
			0,
		);

		const workflowName =
			workflow.metadata?.name || workflow.name || result?.workflowName || 'unnamed-workflow';

		return {
			workflowName,
			workflowVersion: workflow.metadata?.version || workflow.version,
			executionId: result?.executionId,
			nodes,
			edges,
			phases,
			entryPoints,
			exitPoints,
			hasCycle: cycle.hasCycle,
			cyclePath: cycle.cyclePath,
			summary: {
				totalSteps: nodes.length,
				totalEdges: edges.length,
				totalPhases: phases.length,
				maxParallelism,
			},
		};
	}

	private static toExecutionNode(step: ParsedStep) {
		return createExecutionNode()
			.setStepId(step.id)
			.setUses(step.action)
			.setInput(step.input ?? {})
			.setDependencies(this.normalizeDependencies(step.needs))
			.setCondition(step.when)
			.setMaxRetries(step.retry?.max ?? 0)
			.setTimeout(this.parseTimeout(step.timeout))
			.setAdapter(null)
			.build();
	}

	private static normalizeDependencies(needs: ParsedStep['needs']): string[] {
		return Array.from(new Set(needs ?? [])).sort((left, right) => left.localeCompare(right));
	}

	private static parseTimeout(timeout: string | undefined): number | undefined {
		if (!timeout) {
			return undefined;
		}

		const match = timeout.match(/^([0-9]+)(ms|s|m|h)$/);
		if (!match) {
			return undefined;
		}

		const value = Number(match[1]);
		switch (match[2]) {
			case 'ms':
				return value;
			case 's':
				return value * 1000;
			case 'm':
				return value * 60 * 1000;
			case 'h':
				return value * 60 * 60 * 1000;
			default:
				return undefined;
		}
	}

	private static buildVisualizationNode(
		stepId: string,
		uses: string,
		dependencies: readonly string[],
		dependents: readonly string[],
		phase: number | undefined,
		isEntryPoint: boolean,
		isExitPoint: boolean,
		stepResult: StepResult | undefined,
	): VisualizationNode {
		return {
			id: stepId,
			label: stepId,
			uses,
			dependencies: [...dependencies],
			dependents: [...dependents],
			phase,
			isEntryPoint,
			isExitPoint,
			status: stepResult?.status,
			durationMs: stepResult?.duration,
			attempts: stepResult?.attempts,
			error: stepResult?.error?.message,
		};
	}
}
