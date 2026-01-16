import type { Action, GameState, Unit } from './types';
import { useGameStore } from './store';

/**
 * Action Processor Module
 * -----------------------
 * Handles the Execution Phase of the turn.
 * - Processes the Action Queue sequentially.
 * - Manages Animations (Visual delays).
 * - Enforces Game Rules during execution (Range checks, Collision checks).
 * - Updates Game State via Store.
 */

const STEP_DELAY_MS = 300; // Matches CSS transition duration

// Helper to wait (for animation sync)
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
        } else if (action.type === 'ATTACK') {
            await executeAttackAction(action);
        }
    }

    // Clear queue strictly to prevent re-execution next turn
    useGameStore.setState({ actionQueue: [] });

    endExecution();
};

const executeMoveAction = async (action: Action) => {
    const store = useGameStore.getState();
    const unit = store.units[action.unitId];
    if (!unit || !action.target) return;

    // Recalculate path dynamically
    const { findPath } = await import('./pathfinding');

    // We pass empty blockedTiles here because we want to TRY to move along the planned path
    // and stop if blocked dynamically (collision), rather than finding a new path mid-move?
    // Actually, 'executeTurn' is non-interactive. Units follow their committed plan.
    // If blocked, they stop.
    const path = findPath(unit.position, action.target, store.floor, []);

    if (!path) return;

    // Move step by step
    // Skip the first node (current position)
    for (let i = 1; i < path.length; i++) {
        const nextPos = path[i];

        // DYNAMIC COLLISION CHECK
        // Fetch fresh state because other units might have moved during await
        const currentStore = useGameStore.getState();
        const isBlocked = Object.values(currentStore.units).some(u =>
            u.id !== unit.id && // Not self
            u.position.x === nextPos.x &&
            u.position.y === nextPos.y &&
            u.position.floor === nextPos.floor
        );

        // Conflict Policy:
        // - Allow passing through (but we already paid extra AP in planning).
        // - Disallow stopping on occupied tile.
        // - So, only checking collision if this is the FINAL DESTINATION of this move step?
        // But pathfinding returned a path. If we stop mid-way, we might stop ON an enemy if we get blocked later?
        // "Unreachable" means we can't target it.
        // So we should be able to walk over.

        // Wait, if we stop on a unit because AP ran out? 
        // Logic: Path planner ensures we have AP to reach 'target'.
        // So we just need to ensure 'target' is not blocked.
        // But 'target' might become blocked dynamically.
        // If target is blocked, we stop 1 tile before?

        if (isBlocked) {
            // If it's the target tile, we can't enter.
            if (i === path.length - 1) {
                console.log(`Unit ${unit.id} blocked at destination ${nextPos.x},${nextPos.y}`);
                break;
            }
            // Else (Passing through), allow it.
        }

        // Update Unit Position
        store.updateUnitPosition(unit.id, nextPos);

        // Wait for animation
        await wait(STEP_DELAY_MS);
    }
};

const executeAttackAction = async (action: Action) => {
    const store = useGameStore.getState();
    if (!action.targetUnitId) return;

    const attacker = store.units[action.unitId];
    const target = store.units[action.targetUnitId];

    if (!attacker || !target) return;

    // Check Range at Execution Time
    const dist = Math.abs(attacker.position.x - target.position.x) + Math.abs(attacker.position.y - target.position.y);
    if (dist > 1) {
        console.log(`${attacker.id} missed attack on ${target.id} (Out of range)`);
        return;
    }

    console.log(`${attacker.id} attacks ${target.id}!`);

    // Animation Delay (Swing)
    await wait(STEP_DELAY_MS);

    // Apply Damage
    // For now fixed damage or based on something? 
    // User said "Attack Cost 3AP". Did not specify damage. 
    // Let's assume 10 damage for now (Zombie kills player in 10 hits? Player HP 100).
    // Or Zombie HP 3. Player punch?
    // Let's use a base damage.
    const damage = 1; // Updated to 1 as requested
    store.applyDamage(target.id, damage);

    // Hit Delay
    await wait(STEP_DELAY_MS);
};

const endExecution = () => {
    const store = useGameStore.getState();
    store.clearActionQueue();
    store.setPhase('DECISION');
    useGameStore.setState({ timer: 5.0 }); // Reset timer
};
