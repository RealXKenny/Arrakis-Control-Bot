const RECONNECT_WARNING_THRESHOLD = 5;

interface ReconnectState {
  attempts: number;
  warned: boolean;
  closeCode?: number;
}

interface ReconnectAttempt {
  attempts: number;
  shouldWarn: boolean;
  closeCode?: number;
}

interface ReconnectRecovery {
  attempts: number;
  shouldReport: boolean;
}

class ShardReconnectTracker {
  private readonly states = new Map<number, ReconnectState>();

  public disconnected(shardId: number, closeCode: number): void {
    const state = this.states.get(shardId) ?? { attempts: 0, warned: false };
    state.closeCode = closeCode;
    this.states.set(shardId, state);
  }

  public reconnecting(shardId: number): ReconnectAttempt {
    const state = this.states.get(shardId) ?? { attempts: 0, warned: false };
    state.attempts++;
    // Dev note: Five gateway hiccups are weather; the sixth earns a Guild Navigator report.
    const shouldWarn = state.attempts > RECONNECT_WARNING_THRESHOLD && !state.warned;
    if (shouldWarn) state.warned = true;
    this.states.set(shardId, state);
    return { attempts: state.attempts, shouldWarn, closeCode: state.closeCode };
  }

  public recovered(shardId: number): ReconnectRecovery {
    const state = this.states.get(shardId);
    this.states.delete(shardId);
    return { attempts: state?.attempts ?? 0, shouldReport: Boolean(state?.warned) };
  }
}

export { RECONNECT_WARNING_THRESHOLD, ShardReconnectTracker };
export type { ReconnectAttempt, ReconnectRecovery };
