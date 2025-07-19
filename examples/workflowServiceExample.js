/**
 * @file core/workflow/examples/workflowServiceExample.js
 * @description Demonstrates the usage of WorkflowService with Runnable-based workflows,
 *              including starting, event streaming via WorkflowResponse, and resumption
 *              from a persisted state using InMemoryPersistenceProvider.
 *              It showcases how to define simple Runnables, compose them into a sequence,
 *              register this sequence as a workflow definition, and then run instances of it.
 *              Also demonstrates error handling, persistence, and resumption logic.
 *
 * To Run:
 * ```sh
 * # From the project root, assuming dependencies are installed and paths are correct:
 * node -e "import('./core/workflow/examples/workflowServiceExample.js').then(m => m.runWorkflowServiceDemo().catch(console.error))"
 * ```
 */
import WorkflowService from '../WorkflowService.js';
import { InMemoryPersistenceProvider } from '../persistenceProvider.js';
import { ServiceRegistry } from '@token-ring/registry';
import {RunnableError} from "../../runnable2/runnableError.js";
import {RunnableLambda} from "../../runnable2/runnableLambda.js";
import {RunnableSequence} from "../../runnable2/runnableSequence.js"; // Assuming path

// --- Define some simple Runnables for the example workflow (now async generators) ---

/**
 * Helper to create a base object for WorkflowEvents within example Runnables.
 * @param {import('../../runnable2/runnable.js').WorkflowContext | undefined} context - The workflow context.
 * @param {string} runnableName - The name of the runnable.
 * @returns {Pick<import('../workflowEvents.js').BaseWorkflowEvent, "runnableName" | "workflowInstanceId" | "traceId" | "timestamp">}
 */
function createEventBase(context, runnableName) {
    return {
        runnableName,
        workflowInstanceId: context?.workflowInstanceId,
        traceId: context?.traceId,
        timestamp: Date.now(),
    };
}

const step1 = new RunnableLambda(async function* (input, context) {
    const eventBase = createEventBase(context, this.name);
    yield { ...eventBase, type: 'step_start', input };
    yield { ...eventBase, type: 'log', level: 'info', message: `Executing. Input: ${input}.` };
    await new Promise(resolve => setTimeout(resolve, 50));
    if (input < 0) {
        const err = new RunnableError("Input cannot be negative for step 1");
        // Yield step_end with error before throwing is good practice if possible
        // For simplicity here, error is caught by base if not handled by wrapper
        throw err;
    }
    const output = { value: input + 10 };
    yield { ...eventBase, type: 'final_output', data: output };
    return output;
}, { name: 'Step1_AddTen' });

const step2 = new RunnableLambda(async function* (input, context) {
    const eventBase = createEventBase(context, this.name);
    yield { ...eventBase, type: 'step_start', input };
    yield { ...eventBase, type: 'log', level: 'info', message: `Executing. Input: ${JSON.stringify(input)}.`};
    await new Promise(resolve => setTimeout(resolve, 50));

    if (input.value === 13) {
        yield { ...eventBase, type: 'log', level: 'error', message: `SIMULATING FAILURE for input value 13!`};
        throw new RunnableError("Simulated failure in Step2 for value 13");
    }
    const output = { value: input.value * 2, history: [input.value] };
    yield { ...eventBase, type: 'final_output', data: output };
    return output;
}, { name: 'Step2_MultiplyByTwo' });

const step3 = new RunnableLambda(async function* (input, context) {
    const eventBase = createEventBase(context, this.name);
    yield { ...eventBase, type: 'step_start', input };
    yield { ...eventBase, type: 'log', level: 'info', message: `Executing. Input: ${JSON.stringify(input)}.`};
    await new Promise(resolve => setTimeout(resolve, 50));
    const output = { finalValue: input.value - 5, history: [...input.history, input.value] };
    yield { ...eventBase, type: 'final_output', data: output };
    return output;
}, { name: 'Step3_SubtractFive' });


// --- Main Demo Function ---

/**
 * Runs a series of demonstrations for the WorkflowService.
 * 1. Sets up WorkflowService with InMemoryPersistenceProvider.
 * 2. Defines a simple multi-step workflow using RunnableSequence and RunnableLambdas.
 * 3. Registers this workflow.
 * 4. Subscribes to WorkflowService lifecycle events.
 * 5. Runs a successful instance of the workflow, demonstrating event streaming and final response.
 * 6. Runs an instance designed to fail at a specific step, demonstrating error handling and persistence.
 * 7. Attempts to resume the failed workflow, showing it retries the failing step.
 * 8. Demonstrates a "hacked" resumption where persisted state is altered to allow successful completion.
 */
export async function runWorkflowServiceDemo() {
  console.log("--- Starting WorkflowService Demo ---");

  // 1. Setup Services: WorkflowService, PersistenceProvider, and ServiceRegistry
  const persistenceProvider = new InMemoryPersistenceProvider();
  const wfService = new WorkflowService({ persistenceProvider, debug: true });

  const mainRegistry = new ServiceRegistry();
  mainRegistry.register(wfService); // Register WorkflowService itself (optional, but good practice)
  // If Runnables need other services, register them here too.
  // e.g., mainRegistry.register(new MyOtherService());

  // Initialize WorkflowService with the main registry (so it can pass it to contexts)
  await wfService.start(mainRegistry);

  // 2. Define and Register a Workflow
  const simpleWorkflow = new RunnableSequence([step1, step2, step3], { name: 'SimplePersistentWorkflow' });
  wfService.registerWorkflow('DemoWorkflow_v1', simpleWorkflow);

  // 3. Listen to WorkflowService level Events
  //    'workflow_started' signals a WorkflowResponse object is created and execution begins.
  //    Completion/failure is determined by consuming the WorkflowResponse.
  wfService.on('workflow_started', (event) => {
    console.log(`[WFService EVENT] Workflow Started: DefID=${event.definitionId}, InstanceID=${event.workflowInstanceId}, Input: ${JSON.stringify(event.input)}`);
    // console.log(`[WFService EVENT] WorkflowResponse object created:`, event.workflowResponse);
  });

  /**
   * Helper function to consume and log events from a WorkflowResponse.
   * @param {string} caseName - Identifier for the test case.
   * @param {import('../WorkflowResponse.js').WorkflowResponse} workflowResponse - The response object from startWorkflow/resumeWorkflow.
   * @returns {Promise<any>} The final result of the workflow.
   */
  async function processWorkflowResponse(caseName, workflowResponse) {
    console.log(`\n--- ${caseName}: Processing WorkflowResponse (Instance: ${workflowResponse.workflowInstanceId}) ---`);
    console.log(`Streaming events for ${caseName} (Instance: ${workflowResponse.workflowInstanceId}):`);
    try {
      for await (const event of workflowResponse.stream()) {
        // Log concise event info. For full event, use `console.log(event)`
        let eventSummary = `[${caseName} EVENT] (${event.runnableName || 'WF'}) ${event.type}`;
        if (event.type === 'log') eventSummary += ` [${event.level}]: ${event.message}`;
        if (event.type === 'step_start') eventSummary += ` | Input: ${JSON.stringify(event.input)}`;
        if (event.type === 'step_end') {
            if(event.error) eventSummary += ` | ERROR: ${event.error.message}`;
            else eventSummary += ` | Output: ${JSON.stringify(event.output)}`;
            eventSummary += ` (Duration: ${event.durationMs}ms)`;
        }
        if (event.type === 'final_output') eventSummary += ` | Data: ${JSON.stringify(event.data)}`;
        console.log(eventSummary);
      }

      const finalResult = await workflowResponse.response(); // Await the final result
      console.log(`[${caseName}] Final Result (Instance: ${workflowResponse.workflowInstanceId}): ${JSON.stringify(finalResult)}`);
      return finalResult;
    } catch (error) {
      console.error(`[${caseName}] WORKFLOW EXECUTION FAILED (Instance: ${workflowResponse.workflowInstanceId}): ${error.message}`);
      // Optionally, get all buffered events up to the point of failure for debugging:
      // const eventsSoFar = await workflowResponse.allEvents();
      // console.error(`[${caseName}] Events leading to failure:`, JSON.stringify(eventsSoFar, null, 2));
      throw error; // Re-throw for the main demo catch block
    }
  }

  // 4. Run Workflow - Successful Case
  const initialInputSuccess = 5; // Expected: Step1(15) -> Step2(30) -> Step3(25)
  const contextOverridesSuccess = { userData: { userId: 'user-alpha' }, traceId: 'trace-success-001' };
  const responseSuccess = wfService.startWorkflow('DemoWorkflow_v1', initialInputSuccess, contextOverridesSuccess);
  await processWorkflowResponse("Successful Case", responseSuccess);


  // 5. Run Workflow - Case that will fail for Resumption Demo
  const initialInputFail = 3; // Expected: Step1(13) -> Step2 (FAILS)
  const contextOverridesFail = { userData: { userId: 'user-beta' } };
  let failingInstanceId;

  const responseFail = wfService.startWorkflow('DemoWorkflow_v1', initialInputFail, contextOverridesFail);
  failingInstanceId = responseFail.workflowInstanceId; // Get instance ID from WorkflowResponse
  try {
    await processWorkflowResponse("Failing Case", responseFail);
    console.log(`[Failing Case] - Should not be reached as an error is expected.`);
  } catch(err) {
    console.log(`[Failing Case] - Caught expected error: ${err.message}. Instance ID for resumption: ${failingInstanceId}`);
  }


  // 6. Resume Workflow - if an instance ID was captured
  if (failingInstanceId) {
    console.log(`\n--- Attempting to Resume Workflow Instance: ${failingInstanceId} ---`);
    console.log("NOTE: Expecting Step2 to fail again on resume with the same input unless state is altered or step logic changes.");
    const contextOverridesResume = { userData: { userId: 'user-beta-resumed' }, traceId: `trace-resume-${failingInstanceId}` };

    try {
      const responseResumed = await wfService.resumeWorkflow(failingInstanceId, contextOverridesResume);
      await processWorkflowResponse("Resumed Case (expecting failure)", responseResumed);
    } catch (error) {
      console.log(`[Resumed Case (expecting failure)] - Caught expected error from Step2 again: ${error.message}`);
    }

    // --- Second Resumption attempt, but this time we'll "fix" the data in persistence provider (DEMO HACK) ---
    console.log(`\n--- Attempting 2nd Resume for ${failingInstanceId} with HACKED state ---`);
    const state = await persistenceProvider.loadWorkflowState(failingInstanceId);
    if (state && state.currentStepId === 'Step2_MultiplyByTwo') {
        console.log("HACK: Modifying persisted lastOutput for Step2 to be non-failing. Old lastOutput:", state.lastOutput);
        state.lastOutput = { value: 4 }; // Step1 input 3 -> output {value:13}. Now Step2 input {value:4}
                                        // Expected: Step2({value:4}) -> {value:8, history:[4]}
                                        // Then Step3({value:8, history:[4]}) -> {finalValue:3, history:[4,8]}
        await persistenceProvider.saveWorkflowState(
            failingInstanceId, state.definitionId, state.currentStepId,
            state.lastOutput, state.workflowContext
        );
        console.log("HACK: Persisted state updated. New lastOutput for Step2:", state.lastOutput);

        const responseResumedFixed = await wfService.resumeWorkflow(failingInstanceId, contextOverridesResume);
        await processWorkflowResponse("Resumed Fixed Case", responseResumedFixed); // Expected: {"finalValue":3,"history":[4,8]}
    } else {
        console.log("Could not apply HACK, state not as expected for Step2 failure. Current step:", state?.currentStepId);
    }
  } else {
    console.log("\n--- Resumption Demo Skipped (no failing instance ID captured) ---");
  }

  console.log("\n--- WorkflowService Demo Finished ---");
}

// To run this demo:
// import { runWorkflowServiceDemo } from './path/to/this/file';
// runWorkflowServiceDemo().catch(err => console.error("TOP LEVEL DEMO ERROR:", err));

export default { runWorkflowServiceDemo };
