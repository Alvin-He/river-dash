import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { TopicUIController } from "./UIController";
import { OperatorEventLog } from "./OperatorEventLog";

/** Composition root: replace the mock transport here when GDT is integrated. */
const topics = new MockTopicStore();
export const operatorEvents = new OperatorEventLog();
export const uiController = new TopicUIController(topics, topics, operatorEvents);
export const standSimulator = new MockStand(topics);
standSimulator.reportMode("SAFE"); // Only a simulator startup state, never a real-stand assumption.
