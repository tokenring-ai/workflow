import {GraphOrchestrator, RunnableGraph} from "@token-ring/runnable";
import DiscoveryRunnable from "./layers/1-discovery.js";
import DecomposeRunnable from "./layers/2-decompose.js";
import ExecuteRunnable from "./layers/3-execute.js";
import IntegrationRunnable from "./layers/5-integration.js";

export function createLayeredPlannerWorkflow(): GraphOrchestrator {
  const graph = new RunnableGraph();
  graph.addNode("discover", new DiscoveryRunnable());
  graph.addNode("decompose", new DecomposeRunnable());
  graph.addNode("execute", new ExecuteRunnable());
  graph.addNode("integrate", new IntegrationRunnable());

  graph.connect("discover", "decompose");
  graph.connect("decompose", "execute");
  graph.connect("execute", "integrate");

  graph.setEntryNodes("discover");
  graph.setExitNodes("integrate");

  return new GraphOrchestrator(graph, {name: "LayeredPlanner"});
}