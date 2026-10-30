import { MockStand } from "./MockStand.ts";
import { MockTopicStore } from "./MockTopicStore.ts";
import { TopicUIController } from "./UIController.ts";

/**
 * Demo composition root. Only this file chooses a concrete topic transport.
 * Switch to a GDT-backed adapter here after the GDT PR and protocol are ready.
 */
const topics = new MockTopicStore();

export const uiController = new TopicUIController(topics, topics);
export const standSimulator = new MockStand(topics);

// Starting state for the SIMULATOR only; never assume a real stand starts SAFE.
standSimulator.reportMode("SAFE");
