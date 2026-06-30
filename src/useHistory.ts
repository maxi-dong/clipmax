/**
 * useHistory.ts — Generic Undo/Redo history hook
 *
 * Usage:
 *   const { state, set, undo, redo, canUndo, canRedo, historySize } = useHistory(initialValue);
 *
 * - `set(newValue)` pushes a new snapshot to history
 * - `undo()` / `redo()` navigate through history
 * - Keeps at most MAX_HISTORY snapshots to bound memory usage
 */

import { useState, useCallback } from 'react';

const MAX_HISTORY = 50;

export interface UseHistoryReturn<T> {
  state: T;
  /** Push a new state snapshot. Any forward history is cleared. */
  set: (newState: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Total number of past snapshots (excludes current) */
  historySize: number;
}

export function useHistory<T>(initialValue: T): UseHistoryReturn<T> {
  // past[0] is oldest, past[past.length-1] is previous state
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialValue);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback((newStateOrUpdater: T | ((prev: T) => T)) => {
    setPresent((currentPresent) => {
      const newState =
        typeof newStateOrUpdater === 'function'
          ? (newStateOrUpdater as (prev: T) => T)(currentPresent)
          : newStateOrUpdater;

      setPast((prev) => {
        const updated = [...prev, currentPresent];
        // Trim to max history size
        return updated.length > MAX_HISTORY ? updated.slice(updated.length - MAX_HISTORY) : updated;
      });
      setFuture([]);
      return newState;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((currentPast) => {
      if (currentPast.length === 0) return currentPast;
      const previous = currentPast[currentPast.length - 1];
      const newPast = currentPast.slice(0, currentPast.length - 1);
      setPresent((currentPresent) => {
        setFuture((f) => [currentPresent, ...f]);
        return previous;
      });
      return newPast;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      if (currentFuture.length === 0) return currentFuture;
      const next = currentFuture[0];
      const newFuture = currentFuture.slice(1);
      setPresent((currentPresent) => {
        setPast((p) => [...p, currentPresent]);
        return next;
      });
      return newFuture;
    });
  }, []);

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historySize: past.length,
  };
}
