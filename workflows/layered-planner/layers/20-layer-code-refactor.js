// layerConfigExample.js

const { z } = require('zod');

// ----------------------------
// Zod Schemas for Each Layer
// ----------------------------

// 1. Resource/Context Gathering Schema
const ResourceSchema = z.object({
 id: z.string().min(1),             // unique resource identifier
 path: z.string().min(1),           // file or doc path
 why: z.string().min(1)             // relevance explanation
});

// 2. Task Decomposition Schema
const TaskSchema = z.object({
 id: z.string().min(1),             // unique task identifier
 description: z.string().min(1),    // human-readable task
 category: z.enum(['frontend','backend','database','testing','devops','other'])
});

// 3. Risk & Impact Review Schema
const ReviewFindingSchema = z.object({
 id: z.string().min(1),             // identifier for review item
 risk: z.string().min(1),           // potential risk description
 coverage: z.string().min(1)        // test/coverage note
});

// 4. Solution Drafting Schema
const SolutionStepSchema = z.object({
 id: z.string().min(1),             // step identifier
 approach: z.string().min(1),       // primary solution approach
 fallback: z.string().min(1)        // alternative strategy
});

// 5. Code Edit Proposal Schema
const CodeEditSchema = z.object({
 id: z.string().min(1),             // patch identifier
 file: z.string().min(1),           // target file path
 diff: z.string().min(1),           // unified diff or patch text
 description: z.string().min(1)     // short description of the change
});

// ----------------------------
// Prompt Guideline Templates
// ----------------------------

const GATHER_CONTEXT_GUIDELINES = `
Identify the relevant files, modules, and documentation needed.
For each resource, include 'path' and 'why' it's important.
`;

const DECOMPOSE_GUIDELINES = `
Break the goal into atomic subtasks.
Each should be distinct and completable by one engineer.
`;

const RISK_GUIDELINES = `
For each subtask, list key risks and current test coverage.
`;

const SOLUTION_GUIDELINES = `
Propose a primary approach and a fallback strategy.
Include libraries or patterns to use.
`;

const CODE_EDIT_GUIDELINES = `
Generate the code diff/patch for the change.
Annotate with comments explaining why.
`;

// ----------------------------
// ----------------------------
// Extended 10-Layer Configuration
// ----------------------------

const layers = [
 {
  name: 'project_discovery',
  width: 5,
  temperature: 0.2,
  promptGuidelines: `Identify the project's scope, stakeholders, and high-level objectives.`,
  schema: z.object({ id: z.string(), description: z.string() })
 },
 {
  name: 'context_gathering',
  width: 6,
  temperature: 0.3,
  promptGuidelines: GATHER_CONTEXT_GUIDELINES,
  schema: ResourceSchema
 },
 {
  name: 'code_analysis',
  width: 5,
  temperature: 0.35,
  promptGuidelines: `Analyze the codebase to identify patterns, hotspots, and code smells. Include 'finding' and 'location'.`,
  schema: z.object({ id: z.string(), finding: z.string(), location: z.string() })
 },
 {
  name: 'metrics_collection',
  width: 4,
  temperature: 0.4,
  promptGuidelines: `Gather existing performance metrics and error rates. Include 'metric' and 'value'.`,
  schema: z.object({ id: z.string(), metric: z.string(), value: z.union([z.string(), z.number()]) })
 },
 {
  name: 'decomposition',
  width: 4,
  temperature: 0.45,
  promptGuidelines: DECOMPOSE_GUIDELINES,
  schema: TaskSchema
 },
 {
  name: 'dependency_mapping',
  width: 3,
  temperature: 0.5,
  promptGuidelines: `Map module dependencies and interactions. Include 'module' and 'dependsOn'.`,
  schema: z.object({ id: z.string(), module: z.string(), dependsOn: z.array(z.string()) })
 },
 {
  name: 'design_patterns_identification',
  width: 3,
  temperature: 0.55,
  promptGuidelines: `Identify design patterns or anti-patterns in the code. Include 'pattern' and 'usage'.`,
  schema: z.object({ id: z.string(), pattern: z.string(), usage: z.string() })
 },
 {
  name: 'risk_impact_review',
  width: 2,
  temperature: 0.6,
  promptGuidelines: RISK_GUIDELINES,
  schema: ReviewFindingSchema
 },
 {
  name: 'solution_drafting',
  width: 2,
  temperature: 0.65,
  promptGuidelines: SOLUTION_GUIDELINES,
  schema: SolutionStepSchema
 },
 {
  name: 'performance_considerations',
  width: 2,
  temperature: 0.7,
  promptGuidelines: `Suggest performance improvements for identified hotspots. Include 'issue' and 'suggestion'.`,
  schema: z.object({ id: z.string(), issue: z.string(), suggestion: z.string() })
 },
 {
  name: 'security_review',
  width: 2,
  temperature: 0.75,
  promptGuidelines: `Identify potential security vulnerabilities. Include 'vulnerability' and 'severity'.`,
  schema: z.object({ id: z.string(), vulnerability: z.string(), severity: z.enum(['low','medium','high']) })
 },
 {
  name: 'test_plan_generation',
  width: 3,
  temperature: 0.6,
  promptGuidelines: `Generate a test plan. Include 'testDescription' and 'testType'.`,
  schema: z.object({ id: z.string(), testDescription: z.string(), testType: z.enum(['unit','integration','e2e']) })
 },
 {
  name: 'integration_plan_creation',
  width: 2,
  temperature: 0.6,
  promptGuidelines: `Outline integration steps with external systems. Include 'integration' and 'steps'.`,
  schema: z.object({ id: z.string(), integration: z.string(), steps: z.array(z.string()) })
 },
 {
  name: 'code_edit_proposal',
  width: 1,
  temperature: 0.9,
  promptGuidelines: CODE_EDIT_GUIDELINES,
  schema: CodeEditSchema
 },
 {
  name: 'documentation_update',
  width: 2,
  temperature: 0.5,
  promptGuidelines: `Specify documentation changes. Include 'section' and 'changeSummary'.`,
  schema: z.object({ id: z.string(), section: z.string(), changeSummary: z.string() })
 },
 {
  name: 'review_and_feedback',
  width: 2,
  temperature: 0.5,
  promptGuidelines: `Collect feedback on code edits. Include 'reviewer' and 'feedback'.`,
  schema: z.object({ id: z.string(), reviewer: z.string(), feedback: z.string() })
 },
 {
  name: 'deployment_planning',
  width: 2,
  temperature: 0.5,
  promptGuidelines: `Plan deployment steps. Include 'environment' and 'steps'.`,
  schema: z.object({ id: z.string(), environment: z.string(), steps: z.array(z.string()) })
 },
 {
  name: 'monitoring_setup',
  width: 2,
  temperature: 0.5,
  promptGuidelines: `Define monitoring metrics and alerts. Include 'metric' and 'threshold'.`,
  schema: z.object({ id: z.string(), metric: z.string(), threshold: z.union([z.number(), z.string()]) })
 },
 {
  name: 'retrospective_analysis',
  width: 1,
  temperature: 0.3,
  promptGuidelines: `Summarize lessons learned and improvement areas. Include 'lesson' and 'improvement'.`,
  schema: z.object({ id: z.string(), lesson: z.string(), improvement: z.string() })
 }
];

module.exports = { layers };

module.exports = { layers };
