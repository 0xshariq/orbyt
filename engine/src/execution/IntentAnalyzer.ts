/**
 * Intent Layer
 * 
 * Intelligence layer that understands WHAT the workflow is trying to do.
 * 
 * This layer analyzes workflow structure, metadata, and annotations to:
 * - Classify workflow intent
 * - Provide better errors
 * - Enable optimization
 * - Generate smart explanations
 * 
 * Foundation: Basic intent detection from annotations.
 * Future: Pattern recognition, ML-based classification.
 */

import { LoggerManager } from '../logging/LoggerManager.js';
import { ClassifiedIntent, IntentRecommendations, ParsedWorkflow, WorkflowIntent } from '../types/core-types.js';



/**
 * Intent Layer Analyzer
 * 
 * Understands what workflows are trying to do.
 * Foundation for intelligent behavior.
 */
export class IntentAnalyzer {
    /**
     * Classify workflow intent
     * 
     * Foundation: Checks annotations and basic patterns
     * Future: ML-based classification, pattern recognition
     */
    static classify(workflow: ParsedWorkflow): ClassifiedIntent {
        const logger = LoggerManager.getLogger();
        
        logger.debug('Classifying workflow intent', {
            workflowName: workflow.name,
            stepCount: workflow.steps.length,
        });

        // 1. Check explicit intent annotation
        const explicitIntent = this.checkExplicitIntent(workflow);
        if (explicitIntent) {
            logger.debug('Intent classified from explicit annotation', {
                intent: explicitIntent.intent,
                confidence: explicitIntent.confidence,
            });
            return explicitIntent;
        }

        // 2. Analyze workflow structure
        const structuralIntent = this.analyzeStructure(workflow);
        if (structuralIntent.confidence !== 'low') {
            logger.debug('Intent classified from structure', {
                intent: structuralIntent.intent,
                confidence: structuralIntent.confidence,
                reasoning: structuralIntent.reasoning,
            });
            return structuralIntent;
        }

        // 3. Analyze step patterns
        const patternIntent = this.analyzeStepPatterns(workflow);
        logger.debug('Intent classified from step patterns', {
            intent: patternIntent.intent,
            confidence: patternIntent.confidence,
            reasoning: patternIntent.reasoning,
        });

        return patternIntent;
    }

    /**
     * Check for explicit intent annotation
     */
    private static checkExplicitIntent(
        workflow: ParsedWorkflow
    ): ClassifiedIntent | null {
        // Check annotations['ai.intent']
        const aiIntent = workflow.annotations?.['ai.intent'];

        if (aiIntent && this.isKnownIntent(aiIntent)) {
            return {
                intent: aiIntent as WorkflowIntent,
                confidence: 'high',
                reasoning: 'Explicit ai.intent annotation',
                patterns: ['explicit-annotation'],
            };
        }

        return null;
    }

    /**
     * Analyze workflow structure for intent
     */
    private static analyzeStructure(workflow: ParsedWorkflow): ClassifiedIntent {
        const patterns: string[] = [];

        // Check workflow name/description for keywords
        const name = workflow.name?.toLowerCase() || '';
        const description = workflow.metadata?.description?.toLowerCase() || '';
        const text = `${name} ${description}`;

        // Data pipeline patterns
        if (this.containsKeywords(text, ['etl', 'pipeline', 'transform', 'extract'])) {
            patterns.push('data-keywords');
            return {
                intent: 'data-pipeline',
                confidence: 'medium',
                reasoning: 'Found data pipeline keywords in name/description',
                patterns,
            };
        }

        // Deployment patterns
        if (this.containsKeywords(text, ['deploy', 'release', 'rollout'])) {
            patterns.push('deployment-keywords');
            return {
                intent: 'deployment',
                confidence: 'medium',
                reasoning: 'Found deployment keywords',
                patterns,
            };
        }

        // Testing patterns
        if (this.containsKeywords(text, ['test', 'qa', 'validate', 'verify'])) {
            patterns.push('testing-keywords');
            return {
                intent: 'testing',
                confidence: 'medium',
                reasoning: 'Found testing keywords',
                patterns,
            };
        }

        return {
            intent: 'unknown',
            confidence: 'low',
            reasoning: 'No clear intent from structure',
            patterns,
        };
    }

    /**
     * Analyze step patterns for intent
     */
    private static analyzeStepPatterns(workflow: ParsedWorkflow): ClassifiedIntent {
        const patterns: string[] = [];
        const stepAdapters = workflow.steps.map(s => s.adapter);

        // Data pipeline pattern: fetch -> process -> store
        const hasDataFlow = this.hasPattern(stepAdapters, ['http', 'cli', 'fs']);
        if (hasDataFlow) {
            patterns.push('data-flow-pattern');
            return {
                intent: 'data-pipeline',
                confidence: 'medium',
                reasoning: 'Detected fetch-process-store pattern',
                patterns,
            };
        }

        // Notification pattern: multiple http/webhook calls
        const httpCount = stepAdapters.filter(a => a === 'http').length;
        if (httpCount >= 2) {
            patterns.push('multiple-http-calls');
            return {
                intent: 'notification',
                confidence: 'low',
                reasoning: 'Multiple HTTP calls detected',
                patterns,
            };
        }

        // Orchestration: many different adapters
        const uniqueAdapters = new Set(stepAdapters).size;
        if (uniqueAdapters >= 4) {
            patterns.push('multi-adapter');
            return {
                intent: 'orchestration',
                confidence: 'low',
                reasoning: 'Multiple adapter types suggest orchestration',
                patterns,
            };
        }

        return {
            intent: 'automation',
            confidence: 'low',
            reasoning: 'General automation (no specific pattern detected)',
            patterns: ['generic'],
        };
    }

    /**
     * Get recommendations based on intent
     */
    static getRecommendations(
        intent: WorkflowIntent
    ): IntentRecommendations {
        // Foundation: Basic recommendations
        // Future: Context-aware, experience-based recommendations

        const recommendations: Record<WorkflowIntent, IntentRecommendations> = {
            'data-pipeline': {
                optimizations: [
                    'Consider enabling caching for expensive transformations',
                    'Use parallel processing when steps are independent',
                ],
                warnings: [
                    'Ensure data validation at each stage',
                    'Add retry logic for network-based data fetching',
                ],
                bestPractices: [
                    'Implement idempotent operations',
                    'Add data quality checks',
                ],
            },
            'deployment': {
                optimizations: [
                    'Use health checks after deployment',
                    'Implement rollback logic',
                ],
                warnings: [
                    'Always have a rollback plan',
                    'Test in staging before production',
                ],
                bestPractices: [
                    'Use blue-green or canary deployments',
                    'Implement smoke tests',
                ],
            },
            'testing': {
                optimizations: [
                    'Run fast tests first',
                    'Parallelize independent test suites',
                ],
                bestPractices: [
                    'Fail fast on critical failures',
                    'Generate test reports',
                ],
            },
            'monitoring': {
                optimizations: [
                    'Use appropriate check intervals',
                    'Implement alerting thresholds',
                ],
                bestPractices: [
                    'Define clear success criteria',
                    'Log monitoring results',
                ],
            },
            'notification': {
                optimizations: [
                    'Batch notifications when possible',
                    'Use async delivery',
                ],
                warnings: [
                    'Implement rate limiting',
                    'Handle delivery failures gracefully',
                ],
                bestPractices: [
                    'Template notifications',
                    'Track delivery status',
                ],
            },
            'integration': {
                optimizations: [
                    'Use webhook retention policies',
                    'Implement circuit breakers',
                ],
                warnings: [
                    'Validate external service health',
                    'Handle service unavailability',
                ],
                bestPractices: [
                    'Use API versioning',
                    'Implement proper error handling',
                ],
            },
            'automation': {
                optimizations: [
                    'Identify parallelization opportunities',
                    'Cache repeated operations',
                ],
                bestPractices: [
                    'Make operations idempotent',
                    'Add proper logging',
                ],
            },
            'orchestration': {
                optimizations: [
                    'Optimize step dependencies',
                    'Use parallel execution',
                ],
                warnings: [
                    'Manage service dependencies carefully',
                    'Implement timeout strategies',
                ],
                bestPractices: [
                    'Document service interactions',
                    'Implement comprehensive error handling',
                ],
            },
            'unknown': {
                warnings: [
                    'Consider adding ai.intent annotation for better optimization',
                ],
            },
        };

        return recommendations[intent] || {};
    }

    /**
     * Generate human-friendly explanation of workflow
     */
    static explain(workflow: ParsedWorkflow): string {
        const classified = this.classify(workflow);

        const intentDescriptions: Record<WorkflowIntent, string> = {
            'data-pipeline': 'processes and transforms data',
            'deployment': 'deploys applications or services',
            'testing': 'validates and tests functionality',
            'monitoring': 'monitors system health',
            'notification': 'sends notifications',
            'integration': 'integrates multiple services',
            'automation': 'automates tasks',
            'orchestration': 'orchestrates multiple services',
            'unknown': 'performs automated tasks',
        };

        const description = intentDescriptions[classified.intent];
        const name = workflow.name || 'This workflow';

        return `${name} ${description} (${classified.confidence} confidence)`;
    }

    // Helper methods

    private static isKnownIntent(intent: string): boolean {
        const knownIntents: WorkflowIntent[] = [
            'data-pipeline', 'deployment', 'testing', 'monitoring',
            'notification', 'integration', 'automation', 'orchestration',
        ];
        return knownIntents.includes(intent as WorkflowIntent);
    }

    private static containsKeywords(text: string, keywords: string[]): boolean {
        return keywords.some(keyword => text.includes(keyword));
    }

    private static hasPattern(adapters: string[], pattern: string[]): boolean {
        // Simple pattern matching: check if all pattern adapters exist in sequence
        let patternIndex = 0;
        for (const adapter of adapters) {
            if (adapter === pattern[patternIndex]) {
                patternIndex++;
                if (patternIndex === pattern.length) {
                    return true;
                }
            }
        }
        return false;
    }
}

/**
 * Intent-based error messages
 * 
 * Provides context-aware error messages based on workflow intent
 */
export class IntentAwareErrors {
    /**
     * Get intent-aware error message
     */
    static getMessage(
        intent: WorkflowIntent,
        error: string,
        context?: Record<string, any>
    ): string {
        // Foundation: Basic error enhancement
        // Future: Smart error suggestions based on intent and context

        const baseMessage = error;

        // Add intent-specific context
        const intentContext: Record<WorkflowIntent, string> = {
            'data-pipeline': 'For data pipelines, ensure data sources are accessible and formats are correct.',
            'deployment': 'For deployments, verify permissions and target environment status.',
            'testing': 'For tests, check test data and environment setup.',
            'monitoring': 'For monitoring, ensure endpoints are accessible.',
            'notification': 'For notifications, verify API keys and endpoints.',
            'integration': 'For integrations, check service connectivity.',
            'automation': 'Check that all required resources are available.',
            'orchestration': 'Verify all services are healthy.',
            'unknown': 'Review workflow configuration.',
        };

        const suggestion = intentContext[intent] || '';

        // Add context-specific details if provided
        let enhancedMessage = suggestion ? `${baseMessage}\n\n💡 ${suggestion}` : baseMessage;

        if (context && Object.keys(context).length > 0) {
            const contextStr = Object.entries(context)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            enhancedMessage += `\n\nContext: ${contextStr}`;
        }

        return enhancedMessage;
    }
}
