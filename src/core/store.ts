import { create } from 'zustand';
import type { GameState, GameActions, Coordinate, Unit, Action } from './types';
import { generateMap } from './mapGenerator';
import { decideEnemyActions } from './ai';
import { calculateSimpleFOV } from './fov';

// Initial State
const initialState: GameState = {
    floor: [],
    units: {},
    phase: 'DECISION',
    timer: 5.0,
    actionQueue: [],
    seed: 0,
    visibleTiles: new Set(),
    exploredTiles: new Set(),
    debugFow: false,
    damageEvents: []
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
    ...initialState,

    initGame: (seed = Date.now()) => {
        const { floor, units } = generateMap(seed);
        const player = Object.values(units).find(u => u.type === 'PLAYER');

        let visible = new Set<string>();
        let explored = new Set<string>();

        if (player) {
            visible = calculateSimpleFOV(player.position, player.status.sightRange, floor);
            explored = new Set(visible);
        }

        set({
            ...initialState,
            seed,
            floor,
            units,
            visibleTiles: visible,
            exploredTiles: explored
        });
    },

    setPhase: (newPhase) => {
        set((state) => {
            if (newPhase === 'DECISION') {
                const updatedUnits = { ...state.units };
                Object.keys(updatedUnits).forEach(key => {
                    const u = updatedUnits[key];
                    const recovery = u.status.apRecovery || 5;
                    const currentAp = u.status.ap || 0;
                    updatedUnits[key] = {
                        ...u,
                        status: {
                            ...u.status,
                            ap: Math.min(currentAp + recovery, u.status.maxAp)
                        }
                    };
                });
                return { phase: newPhase, timer: 5.0, units: updatedUnits };
            }

            if (newPhase === 'EXECUTION') {
                const aiActions = decideEnemyActions(state);
                const combinedQueue = [...state.actionQueue, ...aiActions];
                return { phase: newPhase, actionQueue: combinedQueue };
            }

            return { phase: newPhase };
        });
    },

    updateTimer: (deltaTime) => {
        set((state) => {
            if (state.phase !== 'DECISION') return {};
            const newTimer = Math.max(0, state.timer - deltaTime);
            return { timer: newTimer };
        });
    },

    addUnit: (unit) => set((state) => ({
        units: { ...state.units, [unit.id]: unit }
    })),

    updateUnitPosition: (unitId, position) => set((state) => {
        const unit = state.units[unitId];
        if (!unit) return {};

        const updates: Partial<GameState> = {
            units: {
                ...state.units,
                [unitId]: { ...unit, position }
            }
        };

        // FOW Update for Player
        if (unit.type === 'PLAYER') {
            const range = unit.status.sightRange;
            const newVisible = calculateSimpleFOV(position, range, state.floor);

            // Merge with explored
            const newExplored = new Set(state.exploredTiles);
            newVisible.forEach(key => newExplored.add(key));

            updates.visibleTiles = newVisible;
            updates.exploredTiles = newExplored;
        }

        return updates;
    }),

    updateUnitStatus: (unitId, status) => set((state) => {
        const unit = state.units[unitId];
        if (!unit) return {};
        return {
            units: {
                ...state.units,
                [unitId]: { ...unit, status: { ...unit.status, ...status } }
            }
        };
    }),

    queueAction: (action) => set((state) => {
        let newUnits = state.units;
        if (action.cost > 0) {
            const unit = state.units[action.unitId];
            if (unit) {
                newUnits = {
                    ...state.units,
                    [action.unitId]: {
                        ...unit,
                        status: { ...unit.status, ap: unit.status.ap - action.cost }
                    }
                };
            }
        }
        return {
            actionQueue: [...state.actionQueue, action],
            units: newUnits
        };
    }),

    cancelAction: () => set((state) => {
        if (state.actionQueue.length === 0) return {};
        const lastAction = state.actionQueue[state.actionQueue.length - 1];
        const newQueue = state.actionQueue.slice(0, -1);

        let newUnits = state.units;
        if (lastAction.cost > 0) {
            const unit = state.units[lastAction.unitId];
            if (unit) {
                newUnits = {
                    ...state.units,
                    [lastAction.unitId]: {
                        ...unit,
                        status: { ...unit.status, ap: unit.status.ap + lastAction.cost }
                    }
                };
            }
        }
        return {
            actionQueue: newQueue,
            units: newUnits
        };
    }),

    clearActionQueue: () => set({ actionQueue: [] }),

    toggleDebugFow: () => set(state => ({ debugFow: !state.debugFow })),

    applyDamage: (targetId, amount) => set((state) => {
        const target = state.units[targetId];
        if (!target) return {};

        const newHp = target.status.hp - amount;

        // Add Damage Event for UI
        const eventId = crypto.randomUUID();
        const damageEvent = {
            id: eventId,
            position: { ...target.position }, // Snapshot position
            amount,
            timestamp: Date.now()
        };

        // Death Logic
        let newUnits = { ...state.units };
        if (newHp <= 0) {
            delete newUnits[targetId];
            console.log(`Unit ${targetId} died.`);
        } else {
            newUnits[targetId] = {
                ...target,
                status: { ...target.status, hp: newHp, isInjured: newHp < target.status.maxHp * 0.5 }
            };
        }

        return {
            units: newUnits,
            damageEvents: [...state.damageEvents, damageEvent]
        };
    }),

    removeDamageEvent: (eventId) => set((state) => ({
        damageEvents: state.damageEvents.filter(e => e.id !== eventId)
    })),

}));
