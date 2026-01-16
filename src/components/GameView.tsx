import React, { useEffect } from 'react';
import { useGameStore } from '../core/store';
import { GridRenderer } from './GridRenderer/GridRenderer';
import { HUD } from './HUD/HUD';
import styles from './GameView.module.css';



export const GameView: React.FC = () => {
    const { updateTimer, phase, setPhase, actionQueue } = useGameStore();

    // Game Loop for Timer
    useEffect(() => {
        let lastTime = performance.now();
        let frameId: number;

        const loop = (time: number) => {
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            // Update Timer
            updateTimer(delta);

            // Check Timer Expiry -> Execution
            // Note: This logic should ideally be in the store or a controller, 
            // but putting here for React loop simplicity first.
            // We need to access value from store, but hook gives snapshot.
            // Zustand `useGameStore.getState()` is better for loop logic.
            const currentState = useGameStore.getState();

            if (currentState.phase === 'DECISION' && currentState.timer <= 0) {
                useGameStore.getState().setPhase('EXECUTION');
                // Trigger execution logic (will be handled by another effect)
            }

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
    }, [phase]); // Only run when phase changes to EXECUTION

    return (
        <div className={styles.gameView}>
            <GridRenderer />
            <HUD />
        </div>
    );
};
