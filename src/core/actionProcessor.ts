import type { Action, GameState, Unit } from './types';
import { useGameStore } from './store';

const STEP_DELAY_MS = 300; // Matches CSS transition duration

// Helper to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const executeTurn = async () => {
    const store = useGameStore.getState();
    const queue = [...store.actionQueue]; // Copy queue

    if (queue.length === 0) {
        endExecution();
        return;
    }

    // Sort queue if needed (e.g. by initiative). For now, FIFO.
    // We process all actions. Since it's WEGO, simultaneous is ideal, 
    // but for Phase 1 we can do sequential or interleaved.
    // Let's do sequential for simplicity of "Step by Step" verification.

    for (const action of queue) {
        if (action.type === 'MOVE') {
            await executeMoveAction(action);
        }
        // Handle other actions
    }

    endExecution();
};

const executeMoveAction = async (action: Action) => {
    const store = useGameStore.getState();
    const unit = store.units[action.unitId];
    if (!unit || !action.target) return;

    // We need the path. In a real scenario, the path might be stored in the action 
    // or recalculated. Since we only stored 'target', let's recalc path or 
    // assumes the unit moves directly if it's 1 tile?
    // Wait, the action queue stores the "Intent". 
    // The pathfinding should happen during execution or be cached.
    // Better: The Action should contain the full `path` if it's a complex move.
    // But our Action type only has `target`.
    // Let's use the pathfinder again to reconstruct the path from current pos to target.
    const { findPath } = await import('./pathfinding'); // Dynamic import to avoid cycles if any
    const path = findPath(unit.position, action.target, store.floor);

    if (!path) return;

    // Move step by step
    // Skip the first node (current position)
    for (let i = 1; i < path.length; i++) {
        const nextPos = path[i];

        // Update Unit Position
        store.updateUnitPosition(unit.id, nextPos);

        // Wait for animation
        await wait(STEP_DELAY_MS);
    }
};

const endExecution = () => {
    const store = useGameStore.getState();
    store.clearActionQueue();
    store.setPhase('DECISION');
    useGameStore.setState({ timer: 5.0 }); // Reset timer
};
