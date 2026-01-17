import React from 'react';
import { useGameStore } from '../../core/store';
import styles from './ActionMenu.module.css';

export const ActionMenu: React.FC = () => {
    const { units, floor, queueAction, phase, actionQueue, toggleSneak } = useGameStore();

    const playerUnit = Object.values(units).find(u => u.type === 'PLAYER');
    if (!playerUnit) return null;

    const { x, y, floor: z } = playerUnit.position;
    const currentTile = floor[z]?.[x]?.[y];

    const isMyTurn = phase === 'DECISION' && actionQueue.length === 0;

    const handleClimb = () => {
        if (!isMyTurn) return;
        if (playerUnit.status.ap < 3) {
            alert("Not enough AP (3 needed)");
            return;
        }
        queueAction({
            id: crypto.randomUUID(),
            type: 'CLIMB',
            unitId: playerUnit.id,
            target: playerUnit.position,
            cost: 3,
            status: 'QUEUED'
        });
    };

    const handleWait = () => {
        if (!isMyTurn) return;
        queueAction({
            id: crypto.randomUUID(),
            type: 'WAIT', // Need to ensure WAIT is handled in processor? Usually WAIT just ends turn or skips? 
            // Actually 'WAIT' might not be in ActionType properly handled yet.
            // Let's assume it skips current action slot or restores AP slightly? 
            // For now, let's just log it or make it cost 0 and do nothing.
            // Or maybe 'End Turn'? 
            // User requested "Action UI", let's stick to CLIMB for now.
            unitId: playerUnit.id,
            cost: 0,
            status: 'QUEUED'
        });
    };

    // Determine available actions
    const canClimb = currentTile && (currentTile.type === 'STAIRS_UP' || currentTile.type === 'STAIRS_DOWN');

    return (
        <div className={styles.container}>
            <div className={styles.header}>행동</div>
            <div className={styles.buttonList}>
                {/* Movement Mode Toggle */}
                <button
                    className={`${styles.actionButton} ${playerUnit.status.movementMode === 'SNEAK' ? styles.active : ''}`}
                    onClick={() => toggleSneak(playerUnit.id)}
                    disabled={!isMyTurn}
                    style={{ borderColor: playerUnit.status.movementMode === 'SNEAK' ? '#aaddff' : undefined }}
                >
                    {playerUnit.status.movementMode === 'SNEAK' ? '웅크리기 (소음 없음, AP 2배)' : '달리기 (일반)'}
                </button>

                {canClimb && (
                    <button
                        className={styles.actionButton}
                        onClick={handleClimb}
                        disabled={!isMyTurn || playerUnit.status.ap < 3}
                    >
                        {currentTile.type === 'STAIRS_UP' ? '윗층으로 이동 (3 AP)' : '아래층으로 이동 (3 AP)'}
                    </button>
                )}

                {/* Future: Attack, Search, etc. */}
                <button className={styles.actionButton} disabled>
                    수색 (준비중)
                </button>
                <button className={styles.actionButton} disabled>
                    가방
                </button>
            </div>
        </div>
    );
};
