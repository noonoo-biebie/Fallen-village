import type { GameState, Tile, Unit, Action, Coordinate } from './types';
import { findPath } from './pathfinding';

/**
 * AI Logic Module
 * ----------------
 * Responsible for determining Enemy actions based on the current GameState.
 * Implements:
 * 1. Sensory Perception (Vision, Hearing)
 * 2. State Machine (Wander, Chase, Search)
 * 3. Action Planning (Prediction, Reservation, Combo Attacks)
 */

const ATTACK_COST = 3;

// Helper: Calculate Manhattan Distance between two coordinates
const getDist = (a: Coordinate, b: Coordinate) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Helper: Check Vision using 120-degree Cone and Distance checking
const canSee = (observer: Unit, target: Coordinate, floor: Tile[][]): boolean => {
    const dist = getDist(observer.position, target);
    if (dist > observer.status.sightRange) return false;

    // 120-degree cone check
    const dx = target.x - observer.position.x;
    const dy = target.y - observer.position.y;
    let dirX = 0, dirY = 0;
    switch (observer.facing) {
        case 'UP': dirY = -1; break;
        case 'DOWN': dirY = 1; break;
        case 'LEFT': dirX = -1; break;
        case 'RIGHT': dirX = 1; break;
        default: dirY = 1; break; // Default Down
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return true;
    const ndx = dx / len;
    const ndy = dy / len;

    const dot = ndx * dirX + ndy * dirY;
    // cos(60) = 0.5. Let's use 0.3 for grid leniency.
    if (dot < 0.3) return false;

    return true;
};

export const decideEnemyActions = (gameState: GameState): Action[] => {
    const actions: Action[] = [];
    const units = Object.values(gameState.units);
    const enemies = units.filter(u => u.faction === 'ENEMY');
    const players = units.filter(u => u.faction === 'PLAYER');

    const target = players[0]; // Assume single player
    if (!target) return [];

    const currentFloor = gameState.floor[0];
    if (!currentFloor) return [];

    // --- PREDICTION LOGIC ---
    const playerAction = gameState.actionQueue.find(a => a.unitId === target.id && a.type === 'MOVE');
    let predictedTargetPos = target.position;

    if (playerAction && playerAction.target) {
        predictedTargetPos = playerAction.target;
    }

    // --- RESERVATION SYSTEM ---
    const reservedDestinations = new Set<string>();

    // Players are obstacles/hazards (cannot end turn on player)
    players.forEach(p => {
        reservedDestinations.add(`${p.position.x},${p.position.y}`);
    });

    enemies.forEach(enemy => {
        let currentAp = enemy.status.ap;

        // Init Memory
        if (!enemy.memory) {
            enemy.memory = { state: 'WANDER' };
        }

        // --- SENSORS ---
        const currentDist = getDist(enemy.position, target.position);
        const isVisible = canSee(enemy, target.position, currentFloor);
        const playerNoise = target.status.noiseLevel || 3;
        const isAudible = currentDist <= playerNoise;
        const isDetected = isVisible || isAudible;

        // --- STATE TRANSITION ---
        if (isDetected) {
            enemy.memory.lastKnownTargetPos = { ...predictedTargetPos };
            enemy.memory.state = 'CHASE';
        } else if (enemy.memory.state === 'CHASE' && !isDetected) {
            enemy.memory.state = 'SEARCH';
        } else if (enemy.memory.state === 'SEARCH') {
            if (enemy.memory.lastKnownTargetPos &&
                enemy.position.x === enemy.memory.lastKnownTargetPos.x &&
                enemy.position.y === enemy.memory.lastKnownTargetPos.y) {
                enemy.memory.lastKnownTargetPos = undefined;
                enemy.memory.state = 'WANDER';
            }
        }

        // --- ACTION DECISION ---

        // 1. ATTACK (Priority)
        const distToPredicted = getDist(enemy.position, predictedTargetPos);

        // Attack if adjacent AND player is not running out of range
        if (currentDist === 1 && currentAp >= ATTACK_COST && distToPredicted <= 1) {
            actions.push({
                id: crypto.randomUUID(),
                type: 'ATTACK',
                unitId: enemy.id,
                targetUnitId: target.id,
                cost: ATTACK_COST,
                status: 'QUEUED'
            });
            return; // Acted this turn
        }

        // 2. MOVEMENT
        let dest: Coordinate | undefined;

        if (enemy.memory.state === 'CHASE' || enemy.memory.state === 'SEARCH') {
            dest = enemy.memory.lastKnownTargetPos;
        } else if (enemy.memory.state === 'WANDER') {
            // Try random nearby
            for (let i = 0; i < 3; i++) {
                const dx = Math.floor(Math.random() * 3) - 1;
                const dy = Math.floor(Math.random() * 3) - 1;
                if (dx === 0 && dy === 0) continue;
                const tx = enemy.position.x + dx;
                const ty = enemy.position.y + dy;

                // Valid check
                if (tx >= 0 && tx < currentFloor.length && ty >= 0 && ty < currentFloor[0].length &&
                    currentFloor[tx][ty].metadata.walkable) {
                    dest = { x: tx, y: ty, floor: enemy.position.floor };
                    break;
                }
            }
        }

        if (dest) {
            // RESERVATION CHECK
            const key = (c: Coordinate) => `${c.x},${c.y}`;
            let validDest = dest;
            let radius = 0;
            let found = false;

            // If dest is already taken by another unit's plan, find nearest neighbor
            // Spiral search up to radius 2
            while (radius <= 2 && !found) {
                for (let r = 0; r <= radius; r++) {
                    for (let dx = -r; dx <= r; dx++) {
                        for (let dy = -r; dy <= r; dy++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Boundary check for spiral

                            const tx = dest.x + dx;
                            const ty = dest.y + dy;

                            if (tx < 0 || tx >= currentFloor.length || ty < 0 || ty >= currentFloor[0].length) continue;
                            if (!currentFloor[tx][ty].metadata.walkable) continue;

                            const candidateKey = `${tx},${ty}`;
                            if (!reservedDestinations.has(candidateKey)) {
                                validDest = { x: tx, y: ty, floor: dest.floor };
                                found = true;
                                break;
                            }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
                radius++;
            }

            if (found) {
                reservedDestinations.add(key(validDest));

                // Dynamic Obstacles for Pathing: All units (allows cost 2 generic passthrough)
                const allObstacles = units.map(u => u.position);

                const path = findPath(enemy.position, validDest, [currentFloor], allObstacles);


                // Simulating Movement to check AP and Range for Combo Attack
                let actualDest = enemy.position;
                let costAccumulated = 0;
                let reachIndex = 0;

                // We simulate the path step-by-step
                if (path) { // Ensure path exists before iterating
                    for (let i = 1; i < path.length; i++) {
                        const prev = path[i - 1];
                        const curr = path[i];

                        // Stop if colliding with target (Player) - though pathfinding should handle checks,
                        // we don't want to move ONTO the player.
                        if (curr.x === target.position.x && curr.y === target.position.y) {
                            break;
                        }

                        const isDiagonal = prev.x !== curr.x && prev.y !== curr.y;
                        const stepCost = isDiagonal ? 1.5 : 1.0;

                        if (currentAp >= (costAccumulated + stepCost)) {
                            costAccumulated += stepCost;
                            actualDest = curr;
                            reachIndex = i;
                        } else {
                            // Cannot afford next step
                            break;
                        }
                    }
                }

                // Only move if we can at least take 1 step (reachIndex > 0)
                // And if actualDest is different from start
                if (reachIndex > 0 && (actualDest.x !== enemy.position.x || actualDest.y !== enemy.position.y)) {

                    actions.push({
                        id: crypto.randomUUID(),
                        type: 'MOVE',
                        unitId: enemy.id,
                        target: actualDest,
                        cost: costAccumulated,
                        status: 'QUEUED'
                    });

                    // --- COMBO ATTACK CHECK ---
                    // If we have enough AP left AND we are now adjacent to the target
                    // We can queue an attack immediately after the move.

                    const remainingAp = currentAp - costAccumulated;
                    const distFromDest = getDist(actualDest, predictedTargetPos);

                    if (remainingAp >= ATTACK_COST && distFromDest <= 1) {
                        actions.push({
                            id: crypto.randomUUID(),
                            type: 'ATTACK',
                            unitId: enemy.id,
                            targetUnitId: target.id,
                            cost: ATTACK_COST,
                            status: 'QUEUED'
                        });
                        // Console log for debug? 
                        // console.log(`${enemy.id} plans Move -> Attack combo!`);
                    }
                }
            }
        }
    });

    return actions;
};
