import { create } from 'zustand';
import type { GameState, Coordinate, Unit, Action, FloorData, TileType } from './types';
import { generateMap } from './mapGenerator'; // We will create this next

interface GameActions {
    // Initialization
    initGame: (seed?: number) => void;

    // Phase Control
    setPhase: (phase: 'DECISION' | 'EXECUTION') => void;
    updateTimer: (deltaTime: number) => void;

    // Units
    addUnit: (unit: Unit) => void;
    updateUnitPosition: (unitId: string, position: Coordinate) => void;
    updateUnitStatus: (unitId: string, status: Partial<Unit['status']>) => void;

    // Action Queue
    queueAction: (action: Action) => void;
    cancelAction: () => void;
    clearActionQueue: () => void;
}

// Initial State
const initialState: GameState = {
    floor: [],
    units: {},
    players: {}, // To be typed properly if needed
    phase: 'DECISION',
    timer: 5.0, // 5 seconds decision time
    actionQueue: [],
    seed: 0,
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
    ...initialState,

    initGame: (seed = Date.now()) => {
        const floor = generateMap(seed);
        const startX = Math.floor(floor[0].length / 2);
        const startY = Math.floor(floor[0][0].length / 2);

        const playerUnit: Unit = {
            id: 'player-1',
            type: 'PLAYER',
            name: 'Survivor',
            position: { x: startX, y: startY, floor: 0 },
            status: { hp: 100, maxHp: 100, ap: 10, maxAp: 10, isInjured: false },
            facing: 'DOWN'
        };

        set({
            ...initialState,
            seed,
            floor,
            units: { [playerUnit.id]: playerUnit },
        });
    },

    setPhase: (phase) => {
        set((state) => {
            const updates: Partial<GameState> = { phase };

            // Recover AP on start of DECISION phase
            if (phase === 'DECISION') {
                const newUnits = { ...state.units };
                Object.keys(newUnits).forEach(id => {
                    const unit = { ...newUnits[id] };
                    const recoveredAp = Math.min(unit.status.maxAp, unit.status.ap + 5);
                    unit.status = { ...unit.status, ap: recoveredAp };
                    newUnits[id] = unit;
                });
                updates.units = newUnits;
            }
            return updates;
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
        return {
            units: {
                ...state.units,
                [unitId]: { ...unit, position }
            }
        };
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
        // Deduct AP if needed
        let newUnits = state.units;
        if (action.cost > 0) {
            const unit = state.units[action.unitId];
            if (unit) {
                if (unit.status.ap < action.cost) {
                    console.warn("Not enough AP");
                    return {}; // Cancel if not enough AP (Should be prevented by UI)
                }
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

        // Refund AP
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
}));
