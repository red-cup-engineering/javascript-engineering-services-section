/**
 * SchemaContract-checked service lifecycle event and record construction.
 */

import {
  serviceLifecycleEventContract,
  serviceLifecycleRecordContract,
  type ServiceLifecycleEvent,
  type ServiceLifecycleRecord,
} from "./lifecycle-schema-schema.mts";
import { processIsoNow } from "./clock.mts";

export type ServiceLifecycleBoundary = ServiceLifecycleEvent["boundary"];
export type ServiceLifecycleEventName = ServiceLifecycleEvent["event"];

export interface ServiceLifecycleEventInput {
  readonly service: string;
  readonly boundary: ServiceLifecycleBoundary;
  readonly event: ServiceLifecycleEventName;
  readonly at?: string;
  readonly ok?: boolean;
  readonly code?: number;
  readonly signal?: string | null;
  readonly detail?: unknown;
  readonly evidence?: readonly string[];
}

export interface ServiceLifecycleRecordInput {
  readonly service: string;
  readonly boundary: ServiceLifecycleBoundary;
  readonly events: readonly ServiceLifecycleEvent[];
  readonly ok?: boolean;
}

/** Construct one schema-checked lifecycle event at a concrete service boundary. */
export function serviceLifecycleEvent(input: ServiceLifecycleEventInput): ServiceLifecycleEvent {
  const event = {
    kind: "node-process.services.lifecycle-event" as const,
    service: input.service,
    boundary: input.boundary,
    event: input.event,
    at: input.at ?? processIsoNow(),
    ok: input.ok ?? true,
    ...(input.code === undefined ? {} : { code: input.code }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    evidence: Object.freeze([...(input.evidence ?? [input.service])]),
  };
  return serviceLifecycleEventContract.assert(Object.freeze(event));
}

/** Collect schema-checked lifecycle events into one finite service-boundary record. */
export function serviceLifecycleRecord(input: ServiceLifecycleRecordInput): ServiceLifecycleRecord {
  const events = Object.freeze([...input.events]);
  return serviceLifecycleRecordContract.assert(Object.freeze({
    kind: "node-process.services.lifecycle-record" as const,
    service: input.service,
    boundary: input.boundary,
    events,
    ok: input.ok ?? events.every((event) => event.ok),
  }));
}
