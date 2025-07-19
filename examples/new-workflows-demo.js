// Ensure this script can be run as an ES module.
// If your package.json for "packages/core/workflow" doesn't have "type": "module",
// you might need to run this with a flag like `node --experimental-vm-modules new-workflows-demo.js`
// or ensure your Node version inherently supports ESM for .js files.

import {
	runChainingWorkflow,
	runRoutingWorkflow,
	runSimpleParallelWorkflow,
	runOrchestratorWorkersWorkflow,
	runEvaluatorOptimizerWorkflow,
} from "../workflows/index.js";

// --- Mock Services Setup ---

const mockChatService = {
	systemLine: (message) => console.log(`[SYSTEM] ${message}`),
	errorLine: (message) => console.error(`[ERROR] ${message}`),
	userLine: (user, message) => console.log(`[USER: ${user}] ${message}`),
	assistantLine: (assistant, message) =>
		console.log(`[ASSISTANT: ${assistant}] ${message}`),
};

const mockAiClient = {
	generateObject: async ({ messages, schema, prompt }, registry) => {
		mockChatService.systemLine(
			`MockAIClient.generateObject called. System Prompt: ${prompt}`,
		);
		if (schema) {
			mockChatService.systemLine(
				`(MockAIClient notes that an output schema was provided: ${schema.constructor.name === "ZodObject" ? "Zod schema detected" : "Schema present"})`,
			);
		}
		const userInput = messages.find((m) => m.role === "user")?.content || "";

		if (prompt?.includes("loan application")) {
			// For extractApplicationDetailsAgent
			// Simple keyword parsing for demo
			// If a real schema was passed (as in the updated loanChainDef), the AI would try to conform.
			// Here, we just mock the object creation.
			let name = "Unknown Client";
			if (userInput.match(/I'm (\w+)/i))
				name = userInput.match(/I'm (\w+)/i)[1];
			else if (userInput.match(/name is (\w+)/i))
				name = userInput.match(/name is (\w+)/i)[1];

			const loanAmountMatch = userInput.match(/\$(\d+)/);
			const loanAmount = loanAmountMatch ? parseInt(loanAmountMatch[1]) : 0;

			const durationMatch = userInput.match(/(\d+)\s*years?/i);
			const loanTimeInMonths = durationMatch
				? parseInt(durationMatch[1]) * 12
				: 0;

			const incomeMatch = userInput.match(/make \$(\d+k?)/i);
			let monthlyIncome = 0;
			if (incomeMatch) {
				let incomeStr = incomeMatch[1].replace("k", "000");
				monthlyIncome = parseInt(incomeStr) / 12;
			}

			return {
				object: {
					name,
					loan_amount: loanAmount,
					loan_time_in_months: loanTimeInMonths,
					monthly_income: monthlyIncome,
				},
			};
		} else if (
			prompt?.includes("decide if a client can be further processed")
		) {
			// For loanGateAgent
			const appData = JSON.parse(userInput);
			const isAccepted =
				appData.loan_amount / appData.loan_time_in_months <
					0.3 * appData.monthly_income && appData.loan_amount > 0;
			return {
				object: {
					is_client_accepted: isAccepted,
					denial_reason: isAccepted
						? undefined
						: "Loan installment exceeds 30% of monthly income or invalid amount.",
				},
			};
		} else if (prompt?.includes("redirect the client to a correct agent")) {
			// For routeCallAgent
			if (
				userInput.toLowerCase().includes("internet") ||
				userInput.toLowerCase().includes("technical")
			) {
				return { object: { agent_type: "technical" } };
			} else if (
				userInput.toLowerCase().includes("bill") ||
				userInput.toLowerCase().includes("account")
			) {
				return { object: { agent_type: "account" } };
			} else if (
				userInput.toLowerCase().includes("payment") ||
				userInput.toLowerCase().includes("finance")
			) {
				return { object: { agent_type: "finance" } };
			}
			return { object: { agent_type: "unknown" } };
		} else if (prompt?.includes("aggregating translations")) {
			// For aggregateTranslationsAgent
			// Input will be a stringified version of the array of translation outputs + original text
			const originalTextMatch = userInput.match(
				/Original Text:\n(.*?)\n\nTranslations:\n/s,
			);
			const originalText = originalTextMatch
				? originalTextMatch[1]
				: "Original text not found in mock.";

			const translations = [];
			const translationBlocks = userInput.split("\n---\n");
			translationBlocks.forEach((block) => {
				if (block.startsWith("Original Text:")) return; // Skip original text part if it got into blocks
				const langMatch = block.match(/^(\w+) Translation:\n/);
				if (langMatch) {
					const lang = langMatch[1];
					const text = block.substring(langMatch[0].length);
					translations.push({
						language: lang,
						text: text.trim(),
						notes: "Mock aggregated.",
					});
				}
			});
			return {
				object: {
					original_text: originalText,
					aggregated_translations: translations,
					summary_notes: "All translations aggregated by mock.",
				},
			};
		} else if (prompt?.includes("break this down into high-level tasks")) {
			// For TechLeadAgent
			const featureRequest = userInput.replace("Feature Request: ", "");
			return {
				object: [
					{
						role: "developer",
						taskId: "dev-001",
						taskDescription: `Implement UI for ${featureRequest}`,
					},
					{
						role: "developer",
						taskId: "dev-002",
						taskDescription: `Implement API for ${featureRequest}`,
					},
					{
						role: "qa",
						taskId: "qa-001",
						taskDescription: `Write test cases for ${featureRequest}`,
					},
					{
						role: "devops",
						taskId: "devops-001",
						taskDescription: `Setup deployment for ${featureRequest}`,
					},
				],
			};
		} else if (prompt?.includes("estimate the effort in man-days")) {
			// For EstimationAgent
			const taskDesc = userInput;
			let estimate = 1;
			if (taskDesc.includes("UI")) estimate = 3;
			else if (taskDesc.includes("API")) estimate = 2;
			else if (taskDesc.includes("test cases")) estimate = 1.5;
			else if (taskDesc.includes("deployment")) estimate = 0.5;
			return {
				object: {
					man_days_estimate: estimate,
					reasoning: `Mock reasoning for estimating ${taskDesc.substring(0, 30)}... at ${estimate} days.`,
				},
			};
		} else if (
			prompt?.includes("Scrum Master") &&
			prompt.includes("summarize these estimations")
		) {
			// For ScrumMasterAgent
			const estimationsText = userInput.match(
				/Individual Estimations from Team:\n([\s\S]*?)\n\nPlease generate/s,
			);
			const individualEstimations = [];
			let totalEstimate = 0;
			if (estimationsText && estimationsText[1]) {
				const estLines = estimationsText[1].trim().split("\n---\n");
				estLines.forEach((lineSet) => {
					const roleMatch = lineSet.match(/Role: (\w+)/);
					const taskIdMatch = lineSet.match(/Task ID: ([\w-]+)/);
					const taskMatch = lineSet.match(/Task: (.*?)\n/);
					const estimateMatch = lineSet.match(/Estimate: ([\d.]+) man-days/);
					const reasoningMatch = lineSet.match(/Reasoning: (.*)/);
					const statusMatch = lineSet.match(/Status: (.*)/);

					if (
						roleMatch &&
						taskIdMatch &&
						taskMatch &&
						estimateMatch &&
						reasoningMatch &&
						statusMatch
					) {
						const estimate = parseFloat(estimateMatch[1]);
						if (statusMatch[1] === "fulfilled") totalEstimate += estimate;
						individualEstimations.push({
							role: roleMatch[1],
							taskId: taskIdMatch[1],
							task: taskMatch[1],
							estimate: estimate,
							reasoning: reasoningMatch[1],
							status: statusMatch[1],
						});
					}
				});
			}
			return {
				object: {
					summary_report: "Aggregated estimations report by Mock Scrum Master.",
					total_estimated_man_days: totalEstimate,
					issues_highlighted: "No major issues highlighted by mock.",
					individual_estimations: individualEstimations,
				},
			};
		} else if (
			prompt?.includes("writer's supervisor") &&
			prompt.includes("evaluate if it meets the requirements")
		) {
			// For ArticleSupervisorAgent
			const articleText =
				userInput.match(/Article Text:\n---\n([\s\S]*?)\n---/s)?.[1] || "";
			// Simulate iterative evaluation: satisfy on 2nd or 3rd try based on article length or content
			let satisfied = false;
			let feedback = "Needs more substance.";
			if (
				articleWriterCallCount > 1 ||
				articleText.includes("revised based on feedback")
			) {
				// articleWriterCallCount is a global mock helper
				satisfied = true;
				feedback = "Much better, this meets the requirements!";
			}
			if (articleText.length < 30 && articleWriterCallCount === 1) {
				// Example: too short on first try
				feedback =
					"The article is too short. Please elaborate further, especially on the impact of AI Agent Workflows.";
				satisfied = false;
			} else if (
				articleText.length < 60 &&
				articleWriterCallCount === 2 &&
				articleText.includes("revised based on feedback")
			) {
				feedback = "Good improvement, but can you add a concluding sentence?";
				satisfied = false;
			} else if (articleText.includes("revised based on feedback")) {
				satisfied = true;
				feedback = "Excellent, this is now complete and satisfactory.";
			}

			return { object: { feedback, satisfied, score: satisfied ? 8 : 4 } };
		}
		// Fallback for other schema-based calls
		mockChatService.errorLine(
			`MockAIClient.generateObject: Unhandled prompt scenario for schema generation. Prompt: ${prompt}`,
		);
		return {
			object: {
				error: "Unhandled prompt in mock generateObject for this agent/prompt.",
			},
		};
	},
	generateText: async ({ messages, prompt }, registry) => {
		mockChatService.systemLine(
			`MockAIClient.generateText called. System Prompt: ${prompt}`,
		);
		const userInput = messages.find((m) => m.role === "user")?.content || "";

		if (prompt?.includes("translate the following text")) {
			// For translateAgent
			if (prompt.includes("to German")) return { text: `GERMAN: ${userInput}` };
			if (prompt.includes("to Spanish"))
				return { text: `SPANISH: ${userInput}` };
			if (prompt.includes("to Polish")) return { text: `POLISH: ${userInput}` };
			return { text: `TRANSLATION_UNHANDLED_LANG: ${userInput}` };
		} else if (prompt?.includes("You are a writer.")) {
			// For ArticleWriterAgent
			articleWriterCallCount++; // Increment call count for supervisor logic
			const topicMatch = userInput.match(/topic: "(.*?)"/);
			const topic = topicMatch ? topicMatch[1] : "AI";
			const constraintMatch = userInput.match(/Constraint: (.*?)(?:\n|$)/);
			const constraint = constraintMatch ? constraintMatch[1] : "a short piece";

			if (userInput.includes("Previous Article:")) {
				const feedbackMatch = userInput.match(/Feedback:\n---\n(.*?)\n---/s);
				const feedback = feedbackMatch
					? feedbackMatch[1]
					: "general improvements";
				return {
					text: `This is a mock revised article about ${topic} considering constraint "${constraint}" (revised based on feedback: ${feedback.substring(0, 30)}...). It is now longer and more detailed.`,
				};
			}
			return {
				text: `This is a mock first draft article about ${topic} fulfilling constraint "${constraint}". It's probably okay.`,
			};
		}

		const specialistTypeMatch = prompt?.match(/You are a (\w+) specialist/i);
		const specialistType = specialistTypeMatch
			? specialistTypeMatch[1]
			: "general";
		return {
			text: `This is a mocked ${specialistType} support response regarding: "${userInput}"`,
		};
	},
};

// Helper for ArticleSupervisorAgent mock to simulate iteration
let articleWriterCallCount = 0;

const mockModelRegistry = {
	getFirstOnlineClient: async (config) => {
		mockChatService.systemLine(
			`MockModelRegistry.getFirstOnlineClient called with config: ${JSON.stringify(config)}`,
		);
		return mockAiClient;
	},
};

const mockRegistry = {
	requireFirstServiceByType: (typeConstructor) => {
		// A bit simplistic; real registry might use symbols or more robust type checking
		if (
			typeConstructor.name === "ChatService" ||
			typeConstructor.prototype.constructor.name === "ChatService"
		) {
			return mockChatService;
		}
		if (
			typeConstructor.name === "ModelRegistry" ||
			typeConstructor.prototype.constructor.name === "ModelRegistry"
		) {
			return mockModelRegistry;
		}
		mockChatService.errorLine(
			`MockRegistry: Service type "${typeConstructor.name}" not found.`,
		);
		return null;
	},
	getService: (serviceName) => {
		// Added for conceptual HITL service, though it's null in orchestrator
		if (serviceName === "HumanApprovalService") return null;
		return null;
	},
};

const baseWorkflowContext = {
	sharedData: {},
	executionHistory: [], // Will be populated by orchestrators if they use it
	messages: [], // Could be used for chat history if agents need it
	options: {
		// Default options for orchestrators
		breadth: 3,
		maxPasses: 1,
		maxIterations: 2,
		requirePlanApproval: false,
		requireApprovalOnCriticalFailure: false,
		minConfidenceForAutoProceed: 0.7,
	},
	iterationCount: 0, // Used by iterative orchestrators
	iterationArchives: [], // Used by iterative orchestrators
};

// --- Chaining Workflow Example ---
// This section demonstrates a sequence of agents processing data one after another.
// Note on Agent Modules: Agent modules (e.g., "../agents/loan/extractApplicationDetailsAgent.js")
// are dynamically imported by the workflow runners. They are expected to export a primary function
// (e.g., often named `invoke` or `execute`) that accepts ({ input, config, context, registry, logger })
// and returns the agent's output. The exact signature may vary based on the workflow runner's design.
async function demoChainingWorkflow() {
	console.log("\n--- Running Chaining Workflow Demo (Loan Application) ---");

	const loanChainDef = {
		id: "loanProcessingChain",
		name: "Loan Application Processing",
		description: "Extracts loan details and decides on initial acceptance.",
		// Note on Error Handling: This demo focuses on successful paths. In a real application,
		// agents and workflow definitions would need robust error handling, retry mechanisms,
		// or compensation logic, which the workflow system might support.
		steps: [
			{
				id: "extractDetails",
				agentModulePath: "../agents/loan/extractApplicationDetailsAgent.js",
				// Example of conceptually defining an output schema for an agent.
				// The mockAIClient below will simulate producing an object matching this.
				// Real agents might use such schemas for validation or to inform the AI's output structure.
				outputSchema: z.object({
					name: z.string().describe("Client's full name"),
					loan_amount: z.number().positive().describe("Requested loan amount"),
					loan_time_in_months: z
						.number()
						.positive()
						.int()
						.describe("Loan duration in months"),
					monthly_income: z
						.number()
						.positive()
						.describe("Client's gross monthly income"),
				}),
				// No specific 'config' or 'inputMapping' needed here as the mock agent
				// for 'extractDetails' takes the raw initialInput.conversation.
			},
			{
				id: "loanGate",
				agentModulePath: "../agents/loan/loanGateAgent.js",
				// Input is output of previous step (default behavior)
			},
		],
	};

	const initialLoanInput = {
		conversation:
			"Hi, my name is Alex. I'd like to apply for a loan of $10000 for 3 years. I make $60000 a year.",
	};
	// Create a fresh context for each workflow run to avoid interference
	const chainWorkflowContext = JSON.parse(JSON.stringify(baseWorkflowContext));

	const chainResult = await runChainingWorkflow(
		loanChainDef,
		initialLoanInput,
		chainWorkflowContext,
		mockRegistry,
	);

	console.log("\nChaining Workflow Final Output:");
	console.log(JSON.stringify(chainResult.finalOutput, null, 2));
	console.log("\nChaining Workflow All Step Results:");
	chainResult.allStepResults.forEach((stepRes) => {
		console.log(JSON.stringify(stepRes, null, 2));
	});
	console.log("--- End of Chaining Workflow Demo ---\n");
}

// --- Routing Workflow Example ---
async function demoRoutingWorkflow() {
	console.log("\n--- Running Routing Workflow Demo (Call Center) ---");

	const callCenterRouteDef = {
		id: "callCenterRouter",
		name: "Call Center Initial Routing",
		description: "Routes customer queries to the appropriate specialist.",
		routerAgent: {
			agentModulePath: "../agents/callCenter/routeCallAgent.js",
			outputKeyForRouting: "agent_type", // Key in router's output object
		},
		routes: {
			technical: {
				id: "techSupport",
				agentModulePath: "../agents/callCenter/genericSpecialistAgent.js",
				config: {
					specialistType: "Technical",
					systemPrompt:
						"You are a friendly Technical Support specialist. Help with the tech issue.",
				},
			},
			account: {
				id: "accountSupport",
				agentModulePath: "../agents/callCenter/genericSpecialistAgent.js",
				config: {
					specialistType: "Account",
					systemPrompt:
						"You are an Account specialist. Help with account queries.",
				},
			},
			finance: {
				id: "financeSupport",
				agentModulePath: "../agents/callCenter/genericSpecialistAgent.js",
				config: {
					specialistType: "Finance",
					systemPrompt:
						"You are a Finance specialist. Help with payment issues.",
				},
			},
		},
		defaultRoute: {
			id: "generalSupport",
			agentModulePath: "../agents/callCenter/genericSpecialistAgent.js",
			config: {
				specialistType: "General",
				systemPrompt:
					"You are a General Support agent. Try to help with the query.",
			},
		},
		passRouterOutputToRoutedAgent: true, // Merge router's output with initialInput for the specialist
	};

	const initialCallInput1 = {
		customerQuery: "Hello, my internet connection is very slow today!",
	};
	const routeWorkflowContext1 = JSON.parse(JSON.stringify(baseWorkflowContext));

	console.log(`\nRouting query: "${initialCallInput1.customerQuery}"`);
	const routeResult1 = await runRoutingWorkflow(
		callCenterRouteDef,
		initialCallInput1,
		routeWorkflowContext1,
		mockRegistry,
	);
	console.log("Routing Workflow Result 1:");
	console.log(JSON.stringify(routeResult1, null, 2));

	const initialCallInput2 = {
		customerQuery: "I need to update my billing address.",
	};
	const routeWorkflowContext2 = JSON.parse(JSON.stringify(baseWorkflowContext));

	console.log(`\nRouting query: "${initialCallInput2.customerQuery}"`);
	const routeResult2 = await runRoutingWorkflow(
		callCenterRouteDef,
		initialCallInput2,
		routeWorkflowContext2,
		mockRegistry,
	);
	console.log("Routing Workflow Result 2:");
	console.log(JSON.stringify(routeResult2, null, 2));

	console.log("--- End of Routing Workflow Demo ---\n");
}

// --- Main Demo Execution ---
async function main() {
	// Check if ModelRegistry and ChatService are correctly mocked
	if (
		!mockRegistry.requireFirstServiceByType(function ChatService() {}) ||
		!mockRegistry.requireFirstServiceByType(function ModelRegistry() {})
			.getFirstOnlineClient
	) {
		console.error("Registry or services are not mocked correctly. Exiting.");
		return;
	}

	await demoChainingWorkflow();
	await demoRoutingWorkflow();
	await demoSimpleParallelWorkflow();
	await demoOrchestratorWorkersWorkflow();
	await demoEvaluatorOptimizerWorkflow();
}

// --- Simple Parallel Workflow Example ---
async function demoSimpleParallelWorkflow() {
	console.log("\n--- Running Simple Parallel Workflow Demo (Translation) ---");
	const parallelWorkflowContext = JSON.parse(
		JSON.stringify(baseWorkflowContext),
	); // Fresh context

	const textToTranslate =
		"AI Agents can work together in workflows. This is a powerful concept.";
	const parallelInitialInput = { textToTranslate }; // Input for each worker

	const translationParallelDef = {
		id: "parallelTextTranslation",
		name: "Parallel Text Translation and Aggregation",
		description:
			"Translates a text into multiple languages in parallel and then aggregates the results.",
		workerAgents: [
			{
				id: "translator-de",
				agentModulePath: "../agents/text/translateAgent.js",
				config: { targetLanguage: "German", sourceLanguage: "English" },
				// inputMapping: null; // Takes the whole parallelInitialInput
			},
			{
				id: "translator-es",
				agentModulePath: "../agents/text/translateAgent.js",
				config: { targetLanguage: "Spanish" }, // Default source: English
			},
			{
				id: "translator-pl",
				agentModulePath: "../agents/text/translateAgent.js",
				config: { targetLanguage: "Polish" },
			},
		],
		aggregatorAgent: {
			agentModulePath: "../agents/text/aggregateTranslationsAgent.js",
			config: { originalText: textToTranslate }, // Pass original text to aggregator
		},
	};

	const parallelResult = await runSimpleParallelWorkflow(
		translationParallelDef,
		parallelInitialInput,
		parallelWorkflowContext,
		mockRegistry,
	);

	console.log("\nSimple Parallel Workflow Final Output (Aggregated):");
	console.log(JSON.stringify(parallelResult.finalOutput, null, 2));
	console.log("\nSimple Parallel Workflow Worker Results:");
	parallelResult.workerResults?.forEach((workerRes) => {
		console.log(JSON.stringify(workerRes, null, 2));
	});
	console.log("--- End of Simple Parallel Workflow Demo ---\n");
}

// --- Orchestrator-Workers Workflow Example ---
async function demoOrchestratorWorkersWorkflow() {
	console.log(
		"\n--- Running Orchestrator-Workers Workflow Demo (Project Estimation) ---",
	);
	const orchWorkersContext = JSON.parse(JSON.stringify(baseWorkflowContext));

	const projectEstimationDef = {
		id: "projectFeatureEstimation",
		name: "Feature Estimation by Role",
		description:
			"A Tech Lead breaks down a feature, specialists estimate their parts, and a Scrum Master aggregates.",
		orchestratorAgent: {
			agentModulePath: "../agents/projectManagement/techLeadAgent.js",
		},
		workerAgentsMap: {
			developer: {
				agentModulePath: "../agents/projectManagement/estimationAgent.js",
				config: { roleContext: "You are a senior software developer." },
			},
			qa: {
				agentModulePath: "../agents/projectManagement/estimationAgent.js",
				config: { roleContext: "You are a QA engineer." },
			},
			devops: {
				agentModulePath: "../agents/projectManagement/estimationAgent.js",
				config: { roleContext: "You are a DevOps engineer." },
			},
		},
		aggregatorAgent: {
			agentModulePath: "../agents/projectManagement/scrumMasterAgent.js",
		},
	};

	const initialFeatureInput = {
		featureRequest:
			"Develop a new user profile page with avatar upload and activity feed.",
	};

	const result = await runOrchestratorWorkersWorkflow(
		projectEstimationDef,
		initialFeatureInput,
		orchWorkersContext,
		mockRegistry,
	);

	console.log("\nOrchestrator-Workers Workflow Final Report:");
	console.log(JSON.stringify(result.finalReport, null, 2));
	console.log("\nOrchestrator-Workers Tasks Defined by Orchestrator Agent:");
	result.orchestratorTasks?.forEach((task) =>
		console.log(JSON.stringify(task, null, 2)),
	);
	console.log("\nOrchestrator-Workers Worker Execution Details:");
	result.workerExecutionDetails?.forEach((detail) =>
		console.log(JSON.stringify(detail, null, 2)),
	);
	console.log("--- End of Orchestrator-Workers Workflow Demo ---\n");
}

// --- Evaluator-Optimizer Workflow Example ---
async function demoEvaluatorOptimizerWorkflow() {
	console.log(
		"\n--- Running Evaluator-Optimizer Workflow Demo (Article Creation) ---",
	);
	const evalOptContext = JSON.parse(JSON.stringify(baseWorkflowContext));
	evalOptContext.options.maxIterations = 3; // For this demo
	articleWriterCallCount = 0; // Reset mock helper

	const articleCreationDef = {
		id: "iterativeArticleCreation",
		name: "Iterative Article Creation with Supervisor Review",
		description:
			"A writer agent drafts an article, a supervisor evaluates, and the writer refines based on feedback.",
		generatorAgent: {
			agentModulePath: "../agents/contentCreation/articleWriterAgent.js",
			// Config could include style guides, etc.
		},
		evaluatorAgent: {
			agentModulePath: "../agents/contentCreation/articleSupervisorAgent.js",
			config: {
				constraint:
					"The article must be between 3 and 6 sentences and discuss the impact of AI.",
			},
		},
		initialGeneratorInput: {
			topic: "The Impact of AI Agent Workflows",
			constraint:
				"The article must be between 3 and 6 sentences and discuss the impact of AI.",
		}, // This will be part of the 'input' to the generator
		maxIterations: 3,
	};

	// The 'initialTaskInput' for runEvaluatorOptimizerWorkflow is the primary subject/task for the generator.
	// In this case, the initialGeneratorInput object contains all necessary details.
	const result = await runEvaluatorOptimizerWorkflow(
		articleCreationDef,
		articleCreationDef.initialGeneratorInput, // Pass the structured input
		evalOptContext,
		mockRegistry,
	);

	console.log("\nEvaluator-Optimizer Workflow Final Result:");
	console.log(
		`Satisfied: ${result.wasSatisfied}, Iterations: ${result.iterationsTaken}`,
	);
	console.log("Final Work:");
	console.log(JSON.stringify(result.finalWork, null, 2));
	console.log("Last Evaluation:");
	console.log(JSON.stringify(result.lastEvaluation, null, 2));
	console.log("Iteration History:");
	result.history?.forEach((item) => console.log(JSON.stringify(item, null, 2)));
	console.log("--- End of Evaluator-Optimizer Workflow Demo ---\n");
}

main().catch(console.error);

// To run this:
// 1. Make sure `packages/core/workflow/package.json` has `"type": "module"` or use relevant Node flags.
// 2. From the root of the monorepo or from `packages/core/workflow`, run:
//    `node packages/core/workflow/examples/new-workflows-demo.js`
//    (Adjust path if running from a different CWD)
// 3. Ensure the agent paths like `../agents/loan/extractApplicationDetailsAgent.js` are correct
//    relative to `packages/core/workflow/examples/`. (They should be, if this file is in examples/ and agents in agents/)

// Note on dynamic imports: Node's `import()` uses file paths.
// If agentModulePath were, e.g., "@token-ring/loan-agents/extractApplicationDetailsAgent.js",
// you'd need import maps or ensure that package is correctly linked/installed for Node to find it.
// Relative paths as used here are simpler for a local demo structure.
