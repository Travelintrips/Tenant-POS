import { EventEmitter } from "events";

export type SSEEventType =
  | "payment_created"
  | "payment_voided"
  | "invoice_updated"
  | "booking_updated"
  | "unit_updated";

export interface SSEEvent {
  type: SSEEventType;
  data?: Record<string, unknown>;
}

class SSEBroker extends EventEmitter {
  publish(type: SSEEventType, data?: Record<string, unknown>): void {
    super.emit("sse", { type, data: data ?? {} });
  }

  subscribe(listener: (event: SSEEvent) => void): () => void {
    this.on("sse", listener);
    return () => this.off("sse", listener);
  }
}

export const sseBroker = new SSEBroker();
sseBroker.setMaxListeners(500);
