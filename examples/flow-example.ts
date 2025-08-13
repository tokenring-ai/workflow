// Example demonstrating the usage of the flow library
// noinspection JSUnusedLocalSymbols

import { flow, parallel, all, queue, deferred } from "../flow.js";

interface UserData {
  id: number;
  name: string;
}

interface ProcessedItem {
  id: number;
  name: string;
  processed: boolean;
}

interface Item {
  id: number;
  name: string;
}

/**
 * Simple example of using flow to execute a task
 */
async function basicFlowExample(): Promise<void> {
  console.log("---- Basic Flow Example ----");

  const result = await flow("fetchData", async () => {
    // Simulate fetching data
    console.log("Fetching data...");
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { id: 1, name: "Sample Data" };
  });

  console.log("Result:", result);
}

/**
 * Example showing how to use nested flows
 */
async function nestedFlowExample(): Promise<void> {
  console.log("\n---- Nested Flow Example ----");

  const result = await flow("processUser", async () => {
    // Main flow task
    console.log("Processing user...");

    // Nested flow for fetching user data
    const userData = await flow<UserData>("fetchUserData", async () => {
      console.log("Fetching user data...");
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { id: 123, name: "John Doe" };
    });

    // Nested flow for fetching user permissions
    const permissions = await flow<string[]>("fetchPermissions", async () => {
      console.log("Fetching user permissions...");
      await new Promise((resolve) => setTimeout(resolve, 200));
      return ["read", "write"];
    });

    return {
      user: userData,
      permissions,
    };
  });

  console.log("Processed user result:", result);
}

/**
 * Example showing parallel execution
 */
async function parallelExample(): Promise<void> {
  console.log("\n---- Parallel Example ----");

  const results = await parallel<{ id: number; name: string }>("fetchItems", 3, async (index) => {
    console.log(`Fetching item ${index}...`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { id: index, name: `Item ${index}` };
  });

  console.log("Parallel results:", results);
}

/**
 * Example showing all() function for running multiple producers
 */
async function allExample(): Promise<void> {
  console.log("\n---- All Example ----");

  const producers = [
    async () => {
      console.log("Producer 1 running...");
      await new Promise((resolve) => setTimeout(resolve, 200));
      return "Result 1";
    },
    async () => {
      console.log("Producer 2 running...");
      await new Promise((resolve) => setTimeout(resolve, 300));
      return "Result 2";
    },
    async () => {
      console.log("Producer 3 running...");
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "Result 3";
    },
  ];

  const results = await all<string>("multipleProducers", producers);
  console.log("All results:", results);
}

/**
 * Example showing queued task execution
 */
async function queueExample(): Promise<void> {
  console.log("\n---- Queue Example ----");

  await flow("mainTask", async () => {
    console.log("Starting main task...");

    // Queue up a queued task
    const whenDone = queue({ 
      name: "backgroundTask", 
      fn: async () => {
        console.log("Background task running...");
      },
      retries: 2 
    });

    console.log("Main task continuing without waiting for background task...");

    await whenDone;

    console.log("Background task finished");

    console.log("Main task finished");
  });

  console.log("Queue example completed (background task should have run)");
}

/**
 * Example showing deferred function creation
 */
async function deferredExample(): Promise<void> {
  console.log("\n---- Deferred Example ----");

  // Create a deferred function
  const processItem = deferred<(item: Item) => Promise<ProcessedItem>>(
    "processItem", 
    async (item: Item) => {
      console.log(`Processing ${item.name}...`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { ...item, processed: true };
    }
  );

  // Use the deferred function later
  const items: Item[] = [
    { id: 1, name: "Item A" },
    { id: 2, name: "Item B" },
    { id: 3, name: "Item C" },
  ];

  const results: ProcessedItem[] = [];
  for (const item of items) {
    const result = await processItem(item);
    results.push(result);
  }

  console.log("Processed items:", results);
}

/**
 * Run all examples
 */
async function runAllExamples(): Promise<void> {
  await basicFlowExample();
  await nestedFlowExample();
  await parallelExample();
  await allExample();
  await queueExample();
  await deferredExample();
  console.log("\nAll examples completed!");
}

// Execute the examples
runAllExamples().catch((err) => {
  console.error("Error running examples:", err);
});