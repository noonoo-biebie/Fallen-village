import React, { useEffect } from 'react';
import { useGameStore } from '../core/store';
import { GridRenderer } from './GridRenderer/GridRenderer';
import { HUD } from './HUD/HUD';
import { ActionMenu } from './HUD/ActionMenu';
import styles from './GameView.module.css';

export const GameView: React.FC = () => {
    const { updateTimer, phase } = useGameStore();

    // Game Loop for Timer
    useEffect(() => {
        let lastTime = performance.now();
        let frameId: number;

        const loop = (time: number) => {
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            // Update Timer
            updateTimer(delta);

            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [updateTimer]);

    // Handle Execution Phase
    useEffect(() => {
        if (phase === 'EXECUTION') {
            import('../core/actionProcessor').then(({ executeTurn }) => {
                executeTurn();
            });
        }
    }, [phase]);

    return (
        <div className={styles.gameView}>
            <HUD />
            <GridRenderer />
            <ActionMenu />
        </div>
    );
};
