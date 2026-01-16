import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useGameStore } from '../../core/store';
import { findPath } from '../../core/pathfinding';
import type { Coordinate } from '../../core/types';
import styles from './GridRenderer.module.css';

export const GridRenderer: React.FC = () => {
    const {
        floor, units, initGame, queueAction, phase, actionQueue,
        visibleTiles, exploredTiles, debugFow, toggleDebugFow,
        damageEvents, removeDamageEvent
    } = useGameStore();

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

    const currentZ = 0;
    const currentFloor = floor[currentZ];
    const playerUnit = Object.values(units).find(u => u.type === 'PLAYER');

    const obstacles = Object.values(units)
        .filter(u => u.type !== 'PLAYER')
        .map(u => u.position);

    // Damage Event Cleanup
    useEffect(() => {
        if (damageEvents && damageEvents.length > 0) {
            const timer = setTimeout(() => {
                const now = Date.now();
                damageEvents.forEach(e => {
                    if (now - e.timestamp > 1500) { // 1.5s duration
                        removeDamageEvent(e.id);
                    }
                });
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [damageEvents, removeDamageEvent]);

    useEffect(() => {
        if (!playerUnit || actionQueue.length === 0) {
            setQueuedPath(null);
            return;
        }

        const playerAction = actionQueue.find(a => a.unitId === playerUnit.id && a.type === 'MOVE');

        if (playerAction && playerAction.target) {
            const path = findPath(playerUnit.position, playerAction.target, floor, obstacles);
            setQueuedPath(path);
        } else {
            setQueuedPath(null);
        }
    }, [actionQueue, playerUnit, floor, units]);

    useEffect(() => {
        if (!hoveredTile || !playerUnit || phase !== 'DECISION' || actionQueue.length > 0) {
            setPathPreview(null);
            return;
        }

        if (hoveredTile.x === playerUnit.position.x && hoveredTile.y === playerUnit.position.y) {
            setPathPreview(null);
            return;
        }

        const key = `${hoveredTile.x},${hoveredTile.y}`;
        if (!debugFow && !exploredTiles.has(key) && !visibleTiles.has(key)) {
            setPathPreview(null);
            return;
        }

        // Pass obstacles to allow passthrough (cost calc handles it)
        const path = findPath(playerUnit.position, hoveredTile, floor, obstacles);
        setPathPreview(path);
    }, [hoveredTile, playerUnit, floor, phase, actionQueue.length, units, debugFow, exploredTiles, visibleTiles]);

    const calculatePathCost = (path: Coordinate[]): number[] => {
        if (!path || path.length < 2) return [];
        const costs: number[] = [0];
        let currentCost = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const curr = path[i];
            const next = path[i + 1];

            // Default Cost
            let stepCost = (curr.x !== next.x && curr.y !== next.y) ? 1.5 : 1.0;

            // Check if NEXT tile is occupied by obstacle (Enemy)
            // Note: findPath already handles this logic but we need to visualize correct AP usage.
            // If next tile has enemy, cost is 2.0.
            if (obstacles.some(o => o.x === next.x && o.y === next.y)) {
                stepCost = 2.0;
            }

            currentCost += stepCost;
            costs.push(currentCost);
        }
        return costs;
    };

    const handleTileClick = (coord: Coordinate) => {
        if (phase !== 'DECISION' || !pathPreview || !playerUnit || actionQueue.length > 0) return;

        const costs = calculatePathCost(pathPreview);
        const reachableIndex = costs.findIndex(c => c > playerUnit.status.ap);

        let pathToAction = pathPreview;
        // Slice invisible or unreachable parts?
        // Logic: if cost > AP, we stop there.
        if (reachableIndex !== -1) {
            pathToAction = pathPreview.slice(0, reachableIndex);
        }

        if (pathToAction.length <= 1) return;

        const actionCost = costs[pathToAction.length - 1];
        const finalTarget = pathToAction[pathToAction.length - 1];

        queueAction({
            id: crypto.randomUUID(),
            type: 'MOVE',
            unitId: playerUnit.id,
            target: finalTarget,
            cost: actionCost,
            status: 'QUEUED'
        });

        setPathPreview(null);
    };

    if (!currentFloor) return <div className={styles.gridContainer}>Loading Map...</div>;

    const activePath = queuedPath || pathPreview;
    const costs = activePath ? calculatePathCost(activePath) : [];

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
                <button onClick={toggleDebugFow} style={{ padding: '5px 10px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer' }}>
                    {debugFow ? 'FOW: OFF' : 'FOW: ON'}
                </button>
                <div style={{ color: 'white', marginTop: 5, fontSize: '0.8rem', textAlign: 'right' }}>
                    Player HP: {playerUnit?.status.hp}
                </div>
            </div>

            <div
                className={styles.gridContainer}
                style={{
                    gridTemplateColumns: `repeat(${currentFloor.length}, var(--grid-cell-size))`
                }}
            >
                {currentFloor.map((row, x) => (
                    row.map((tile, y) => {
                        const tileKey = `${x},${y}`;

                        const isVisible = debugFow || visibleTiles.has(tileKey);
                        const isExplored = debugFow || exploredTiles.has(tileKey);

                        const pathIndex = activePath?.findIndex(p => p.x === x && p.y === y);
                        const isPath = pathIndex !== undefined && pathIndex !== -1;
                        const isStart = pathIndex === 0;

                        let isUnreachable = false;
                        const isPreview = !queuedPath && pathPreview;

                        if (isPreview && isPath && playerUnit && pathIndex !== undefined) {
                            if (costs[pathIndex] > playerUnit.status.ap) {
                                isUnreachable = true;
                            }
                        }

                        // Show path if Explored or Visible
                        const showPath = isPath && (isVisible || isExplored);

                        const unitOnTile = Object.values(units).find(u =>
                            u.position.x === x && u.position.y === y && u.position.floor === currentZ
                        );

                        const tileDamageEvents = (damageEvents || []).filter(e => e.position.x === x && e.position.y === y && e.position.floor === currentZ);

                        return (
                            <div
                                key={`${x}-${y}`}
                                className={classNames(styles.tile, {
                                    [styles.dimmed]: isExplored && !isVisible,
                                    [styles.unexplored]: !isExplored && !isVisible,
                                    // Removed old path classes from container
                                })}
                                data-type={tile.type}
                                onMouseEnter={() => setHoveredTile({ x, y, floor: currentZ })}
                                onMouseLeave={() => setHoveredTile(null)}
                                onClick={() => handleTileClick({ x, y, floor: currentZ })}
                            >
                                {/* Path Marker: Rendered separately to stay above FOW dimming */}
                                {showPath && (
                                    <div className={classNames(styles.pathMarker, {
                                        [styles.unreachable]: isUnreachable,
                                        [styles.start]: isStart
                                    })} />
                                )}

                                {(unitOnTile && isVisible) && (
                                    <div className={classNames(styles.unit, {
                                        [styles.unitPlayer]: unitOnTile.type === 'PLAYER',
                                        [styles.unitEnemy]: unitOnTile.type === 'ENEMY'
                                    })}>
                                        {unitOnTile.type === 'ENEMY' && unitOnTile.memory?.state === 'CHASE' && (
                                            <div style={{
                                                position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                                                color: 'red', fontWeight: 'bold', textShadow: '0 0 2px black', fontSize: '1.2rem',
                                                zIndex: 30, animation: 'bounce 0.5s infinite alternate'
                                            }}>!</div>
                                        )}
                                        {unitOnTile.type === 'ENEMY' && unitOnTile.memory?.state === 'SEARCH' && (
                                            <div style={{
                                                position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
                                                color: 'yellow', fontWeight: 'bold', textShadow: '0 0 2px black', fontSize: '1.2rem',
                                                zIndex: 30
                                            }}>?</div>
                                        )}
                                    </div>
                                )}

                                {/* Floating Damage Text */}
                                {tileDamageEvents.map((e, idx) => (
                                    <div key={e.id} style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        marginTop: `-${idx * 25}px`, // Stack vertically
                                        marginLeft: `${(idx % 2) * 10 - 5}px`, // Slight zig-zag
                                        color: '#ff4444', fontSize: '1.5rem', fontWeight: 'bold',
                                        textShadow: '0 0 3px black', pointerEvents: 'none', zIndex: 100 + idx,
                                        animation: 'floatUp 1s ease-out forwards',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        -{e.amount}
                                    </div>
                                ))}
                            </div>
                        );
                    })
                ))}
                <style>{`
                    @keyframes floatUp {
                        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                        100% { transform: translate(-50%, -150%) scale(1.5); opacity: 0; }
                    }
                    @keyframes bounce {
                        from { transform: translate(-50%, 0); }
                        to { transform: translate(-50%, -5px); }
                    }
                `}</style>
            </div>
        </div>
    );
};
