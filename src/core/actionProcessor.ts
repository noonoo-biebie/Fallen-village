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
        } else if (action.type === 'CLIMB') {
            await executeClimbAction(action);
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

    const { findPath } = await import('./pathfinding');

    const path = findPath(
        unit.position,
        action.target,
        store.floor,
        Object.values(store.units),
        unit.id
    );

    if (!path) return;

    for (let i = 1; i < path.length; i++) {
        const nextPos = path[i];

        // DYNAMIC COLLISION CHECK
        const currentStore = useGameStore.getState();
        const blocker = Object.values(currentStore.units).find(u =>
            u.id !== unit.id &&
            u.position.x === nextPos.x &&
            u.position.y === nextPos.y &&
            u.position.floor === nextPos.floor
        );

        if (blocker) {
            const isDestination = (i === path.length - 1);

            if (isDestination) {
                console.log(`Unit ${unit.id} blocked at destination ${nextPos.x},${nextPos.y}`);
                break;
            }

            // Pass-through Logic
            if (unit.type === 'PLAYER' && blocker.type === 'ENEMY') {
                // Allow pass through
            } else {
                console.log(`Unit ${unit.id} blocked by ${blocker.id}`);
                break;
            }
        }

        store.updateUnitPosition(unit.id, nextPos);
        await wait(STEP_DELAY_MS);
    }
};

const executeAttackAction = async (action: Action) => {
    const store = useGameStore.getState();
    if (!action.targetUnitId) return;

    const attacker = store.units[action.unitId];
    const target = store.units[action.targetUnitId];

    if (!attacker || !target) return;

    // Check Range and Floor
    if (attacker.position.floor !== target.position.floor) {
        console.log(`${attacker.id} cannot attack ${target.id} (Different Floor)`);
        return;
    }

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

const executeClimbAction = async (action: Action) => {
    const store = useGameStore.getState();
    const unit = store.units[action.unitId];
    if (!unit) return;

    const { x, y, floor } = unit.position;
    const tile = store.floor[floor][x][y];

    let targetFloor = floor;
    if (tile.type === 'STAIRS_UP') targetFloor = floor + 1;
    else if (tile.type === 'STAIRS_DOWN') targetFloor = floor - 1;
    else {
        console.log("Not on stairs!");
        return;
    }

    if (store.floor[targetFloor]) {
        console.log(`${unit.id} Climbs to floor ${targetFloor}`);
        // Animation delay
        await wait(STEP_DELAY_MS);

        store.updateUnitPosition(unit.id, { x, y, floor: targetFloor });

        await wait(STEP_DELAY_MS);
    } else {
        console.log("Invalid floor target");
    }
};

const endExecution = () => {
    const store = useGameStore.getState();
    store.clearActionQueue();
    store.setPhase('DECISION');
    useGameStore.setState({ timer: 5.0 }); // Reset timer
};
