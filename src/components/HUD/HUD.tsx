import React from 'react';
import classNames from 'classnames';
import { useGameStore } from '../../core/store';
import styles from './HUD.module.css';

export const HUD: React.FC = () => {
    const { timer, phase, units, actionQueue, cancelAction } = useGameStore();

    // Assuming single player for now or finding the 'local' player
    const playerUnit = Object.values(units).find(u => u.type === 'PLAYER');

    const hasQueuedActions = actionQueue.length > 0;

    return (
        <div className={styles.hudContainer}>
            <div className={styles.phaseInfo}>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>CURRENT PHASE</div>
                <div style={{ fontWeight: 'bold' }}>{phase}</div>
            </div>

            <div className={classNames(styles.timer, {
                [styles.low]: phase === 'DECISION' && timer < 2.0
            })}>
                {phase === 'DECISION' ? timer.toFixed(1) : 'WAIT...'}
            </div>

            <div className={styles.playerStats}>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>AP Left</div>
                <div className={styles.apValue}>
                    {playerUnit ? `${playerUnit.status.ap.toFixed(1)} / ${playerUnit.status.maxAp}` : '-'}
                </div>

                {phase === 'DECISION' && (
                    <button
                        className={styles.cancelButton}
                        onClick={cancelAction}
                        disabled={!hasQueuedActions}
                    >
                        Cancel Action ({actionQueue.length})
                    </button>
                )}
            </div>
        </div>
    );
};
