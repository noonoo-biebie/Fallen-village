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

// Helper: Check Vision (360 degrees, Distance Only)
const canSee = (observer: Unit, target: Coordinate, floor: Tile[][]): boolean => {
    const dist = getDist(observer.position, target);
    if (dist > observer.status.sightRange) return false;

    return true;
};

export const decideEnemyActions = (gameState: GameState): Action[] => {
    const actions: Action[] = [];
    const units = Object.values(gameState.units);
    const enemies = units.filter(u => u.type === 'ENEMY');
    const allPlayers = units.filter(u => u.type === 'PLAYER');

    console.log(`AI Debug: Found ${enemies.length} enemies, ${allPlayers.length} players`);

    // Reservation System
    const reservedDestinations = new Set<string>();
    allPlayers.forEach(p => {
        reservedDestinations.add(`${p.position.x},${p.position.y},${p.position.floor}`);
    });

    enemies.forEach(enemy => {
        console.log(`Processing Enemy ${enemy.id} HP:${enemy.status.hp}`);
        if (enemy.status.hp <= 0) return;

        // 1. Identify Target (Same Floor)
        const playersOnFloor = allPlayers.filter(p => p.position.floor === enemy.position.floor);
        console.log(`Enemy ${enemy.id} found ${playersOnFloor.length} players on floor ${enemy.position.floor}`);


        // If no players on same floor, skip for now
        if (playersOnFloor.length === 0) return;

        // Pick closest target
        let target = playersOnFloor[0];
        let minDist = getDist(enemy.position, target.position);

        for (let i = 1; i < playersOnFloor.length; i++) {
            const d = getDist(enemy.position, playersOnFloor[i].position);
            if (d < minDist) {
                minDist = d;
                target = playersOnFloor[i];
            }
        }

        const floorData = gameState.floor[enemy.position.floor];
        if (!floorData) return;

        // --- PREDICTION LOGIC (Per Target) ---
        const playerAction = gameState.actionQueue.find(a => a.unitId === target.id && a.type === 'MOVE');
        let predictedTargetPos = target.position;
        if (playerAction && playerAction.target) {
            // Validate prediction: Don't predict moves into obstacles/units
            const isBlocked = units.some(u =>
                u.position.x === playerAction.target!.x &&
                u.position.y === playerAction.target!.y &&
                u.position.floor === playerAction.target!.floor &&
                u.id !== target.id
            );

            if (!isBlocked) {
                predictedTargetPos = playerAction.target;
            }
        }

        let currentAp = enemy.status.ap;

        // Init Memory
        if (!enemy.memory) {
            enemy.memory = { state: 'SLEEP' };
        }

        // Auto-wake if damaged (any damage)
        if (enemy.memory.state === 'SLEEP' && enemy.status.hp < enemy.status.maxHp) {
            enemy.memory.state = 'WANDER'; // Wake up to Wander/Search
        }

        // --- SENSORS ---
        const currentDist = getDist(enemy.position, target.position);
        let isVisible = canSee(enemy, target.position, floorData);

        // Sleeping enemies cannot see
        if (enemy.memory.state === 'SLEEP') {
            isVisible = false;
        }

        const playerNoise = target.status.noiseLevel ?? 3;
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

        if (currentDist === 1 && currentAp >= ATTACK_COST && distToPredicted <= 1) {
            actions.push({
                id: crypto.randomUUID(),
                type: 'ATTACK',
                unitId: enemy.id,
                targetUnitId: target.id,
                cost: ATTACK_COST,
                status: 'QUEUED'
            });
            return;
        }

        // 2. MOVEMENT
        let dest: Coordinate | undefined;

        if (enemy.memory.state === 'CHASE' || enemy.memory.state === 'SEARCH') {
            dest = enemy.memory.lastKnownTargetPos;
        } else if (enemy.memory.state === 'WANDER') {
            for (let i = 0; i < 3; i++) {
                const dx = Math.floor(Math.random() * 3) - 1;
                const dy = Math.floor(Math.random() * 3) - 1;
                if (dx === 0 && dy === 0) continue;
                const tx = enemy.position.x + dx;
                const ty = enemy.position.y + dy;

                if (tx >= 0 && tx < floorData.length && ty >= 0 && ty < floorData[0].length &&
                    floorData[tx][ty].metadata.walkable) {
                    dest = { x: tx, y: ty, floor: enemy.position.floor };
                    break;
                }
            }
        }

        if (dest) {
            // RESERVATION CHECK
            let validDest = dest;
            let radius = 0;
            let found = false;

            while (radius <= 2 && !found) {
                for (let r = 0; r <= radius; r++) {
                    for (let dx = -r; dx <= r; dx++) {
                        for (let dy = -r; dy <= r; dy++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                            const tx = dest.x + dx;
                            const ty = dest.y + dy;

                            if (tx < 0 || tx >= floorData.length || ty < 0 || ty >= floorData[0].length) continue;
                            if (!floorData[tx][ty].metadata.walkable) continue;

                            const checkKey = `${tx},${ty},${enemy.position.floor}`;
                            if (!reservedDestinations.has(checkKey)) {
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
                reservedDestinations.add(`${validDest.x},${validDest.y},${validDest.floor}`);

                const path = findPath(enemy.position, validDest, [floorData], units, enemy.id);

                let actualDest = enemy.position;
                let costAccumulated = 0;
                let reachIndex = 0;

                if (path) {
                    for (let i = 1; i < path.length; i++) {
                        const prev = path[i - 1];
                        const curr = path[i];

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
                            break;
                        }
                    }
                }

                if (reachIndex > 0 && (actualDest.x !== enemy.position.x || actualDest.y !== enemy.position.y)) {
                    actions.push({
                        id: crypto.randomUUID(),
                        type: 'MOVE',
                        unitId: enemy.id,
                        target: actualDest,
                        cost: costAccumulated,
                        status: 'QUEUED'
                    });

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
                    }
                }
            }
        }
    });

    return actions;
};
