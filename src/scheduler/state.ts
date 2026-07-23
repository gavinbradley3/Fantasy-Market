// Deterministic scheduler state (Phase 7). A tiny holder with an explicit, legal transition
// table so state changes are auditable and predictable. It carries no timing or business
// logic — the Scheduler drives transitions.

import type { SchedulerState } from './types';

const LEGAL: Record<SchedulerState, ReadonlySet<SchedulerState>> = {
  disabled: new Set<SchedulerState>(['disabled']),
  stopped: new Set<SchedulerState>(['idle', 'stopped']),
  idle: new Set<SchedulerState>(['running', 'stopped', 'idle']),
  running: new Set<SchedulerState>(['backingOff', 'idle', 'stopped']),
  backingOff: new Set<SchedulerState>(['running', 'idle', 'stopped']),
};

export class StateHolder {
  private state: SchedulerState;

  constructor(initial: SchedulerState) {
    this.state = initial;
  }

  get(): SchedulerState {
    return this.state;
  }

  is(state: SchedulerState): boolean {
    return this.state === state;
  }

  /** Transition to `next`; returns whether the transition was legal (illegal is a no-op). */
  to(next: SchedulerState): boolean {
    if (!LEGAL[this.state].has(next)) return false;
    this.state = next;
    return true;
  }

  /** Force a state regardless of the legal table (used only for stop() from any state). */
  force(next: SchedulerState): void {
    this.state = next;
  }
}
