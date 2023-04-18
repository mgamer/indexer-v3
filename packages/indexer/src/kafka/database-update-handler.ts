/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "kafka";

// Create a class implementing KafkaEventHandler for each event type
export class DatabaseUpdateHandler implements KafkaEventHandler {
  eventName = "database_change";

  async handle(payload: any): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`Handling ${this.eventName} event with payload:`, payload);
    // Implement logic here
  }
}
