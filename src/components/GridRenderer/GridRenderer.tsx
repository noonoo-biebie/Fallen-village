import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useGameStore } from '../../core/store';
import { findPath } from '../../core/pathfinding';
import type { Coordinate } from '../../core/types';
import styles from './GridRenderer.module.css';

export const GridRenderer: React.FC = () => {
    const { floor, units, initGame, queueAction, phase, actionQueue } = useGameStore();

    // Local state for path preview
    const [hoveredTile, setHoveredTile] = useState<Coordinate | null>(null);
    const [pathPreview, setPathPreview] = useState<Coordinate[] | null>(null);
    const [queuedPath, setQueuedPath] = useState<Coordinate[] | null>(null);

    // Initialize game on mount if empty
    useEffect(() => {
        if (floor.length === 0) {
            initGame();
        }
    }, [floor.length, initGame]);

    // Current floor view (Hardcoded to 0 for now)
    const currentZ = 0;
    const currentFloor = floor[currentZ];

    // Find player unit (for pathfinding source)
    const playerUnit = Object.values(units).find(u => u.type === 'PLAYER');

    // Effect: Calculate Queued Path (Persistent)
    useEffect(() => {
        if (!playerUnit || actionQueue.length === 0) {
            setQueuedPath(null);
            return;
        }

        const lastAction = actionQueue[actionQueue.length - 1];
        if (lastAction.type === 'MOVE' && lastAction.target) {
            // Re-calculate path to the queued target to display it
            const path = findPath(playerUnit.position, lastAction.target, floor);
            setQueuedPath(path);
        } else {
            setQueuedPath(null);
        }
    }, [actionQueue, playerUnit, floor]);

    // Handle Hover -> Calc Path
    useEffect(() => {
        // Single Action Rule: Disable preview if action is already queued
        if (!hoveredTile || !playerUnit || phase !== 'DECISION' || actionQueue.length > 0) {
            setPathPreview(null);
            return;
        }

        // Don't calc path to self
        if (hoveredTile.x === playerUnit.position.x && hoveredTile.y === playerUnit.position.y) {
            setPathPreview(null);
            return;
        }

        const path = findPath(playerUnit.position, hoveredTile, floor);
        setPathPreview(path);
    }, [hoveredTile, playerUnit, floor, phase, actionQueue.length]);

    // Helper to calc path cost array
    const calculatePathCost = (path: Coordinate[]): number[] => {
        if (!path || path.length < 2) return [];

        const costs: number[] = [0]; // Cost at start is 0
        let currentCost = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const curr = path[i];
            const next = path[i + 1];
            const isDiagonal = curr.x !== next.x && curr.y !== next.y;
            currentCost += isDiagonal ? 1.5 : 1.0;
            costs.push(currentCost);
        }
        return costs;
    };

    const handleTileClick = (coord: Coordinate) => {
        if (phase !== 'DECISION' || !pathPreview || !playerUnit || actionQueue.length > 0) return;

        // Smart Movement: Move only as far as AP allows
        const costs = calculatePathCost(pathPreview);
        const reachableIndex = costs.findIndex(c => c > playerUnit.status.ap);

        let pathToAction = pathPreview;
        // If reachableIndex is -1, it means we can reach the end. 
        // If it is > 0, we slice up to that index.
        if (reachableIndex !== -1) {
            pathToAction = pathPreview.slice(0, reachableIndex);
        }

        // If path is empty or just start node, do nothing
        if (pathToAction.length <= 1) return;

        // Calculate total cost of the reachable path
        const actionCost = costs[pathToAction.length - 1];
        const finalTarget = pathToAction[pathToAction.length - 1];

        // Queue Move Action
        queueAction({
            id: crypto.randomUUID(),
            type: 'MOVE',
            unitId: playerUnit.id,
            target: finalTarget,
            cost: actionCost,
            status: 'QUEUED'
        });

        // Clear preview
        setPathPreview(null);
    };

    if (!currentFloor) return <div className={styles.gridContainer}>Loading Map...</div>;

    // Determine which path to display: Queued (Confirmed) > Preview (Hover)
    const activePath = queuedPath || pathPreview;

    // Calculate visible path costs (only needed for preview coloring really, but good for validation)
    const costs = activePath ? calculatePathCost(activePath) : [];

    return (
        <div
            className={styles.gridContainer}
            style={{
                gridTemplateColumns: `repeat(${currentFloor.length}, var(--grid-cell-size))`
            }}
        >
            {currentFloor.map((row, x) => (
                row.map((tile, y) => {
                    const pathIndex = activePath?.findIndex(p => p.x === x && p.y === y);
                    const isPath = pathIndex !== undefined && pathIndex !== -1;
                    const isStart = pathIndex === 0;

                    let isUnreachable = false;
                    // Only check reachable/AP limit if it's a PREVIEW. Queued path is already 'paid for'.
                    const isPreview = !queuedPath && pathPreview;

                    if (isPreview && isPath && playerUnit && pathIndex !== undefined) {
                        if (costs[pathIndex] > playerUnit.status.ap) {
                            isUnreachable = true;
                        }
                    }

                    const unitOnTile = Object.values(units).find(u =>
                        u.position.x === x && u.position.y === y && u.position.floor === currentZ
                    );

                    return (
                        <div
                            key={`${x}-${y}`}
                            className={classNames(styles.tile, {
                                [styles.pathNode]: isPath && !isUnreachable,
                                [styles.pathNodeUnreachable]: isUnreachable,
                                [styles.pathStart]: isStart
                            })}
                            data-type={tile.type}
                            onMouseEnter={() => setHoveredTile({ x, y, floor: currentZ })}
                            onMouseLeave={() => setHoveredTile(null)}
                            onClick={() => handleTileClick({ x, y, floor: currentZ })}
                        >
                            {/* Unit Rendering */}
                            {unitOnTile && (
                                <div className={classNames(styles.unit, {
                                    [styles.unitPlayer]: unitOnTile.type === 'PLAYER',
                                    [styles.unitEnemy]: unitOnTile.type === 'ENEMY'
                                })} />
                            )}
                        </div>
                    );
                })
            ))}
        </div>
    );
};
