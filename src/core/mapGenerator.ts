import type { FloorData, Tile, TileType, TileMetadata, Unit } from './types';

// Simple pseudo-random number generator based on seed
class PRNG {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    // Linear Congruential Generator
    next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }

    range(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const FLOORS = 2; // Enabled 2 Floors

export const generateMap = (seed: number): { floor: FloorData; units: Record<string, Unit> } => {
    const prng = new PRNG(seed);
    const floors: FloorData = [];

    for (let z = 0; z < FLOORS; z++) {
        const floorLayer: Tile[][] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            const row: Tile[] = [];
            for (let y = 0; y < MAP_HEIGHT; y++) {
                // Basic terrain generation logic
                const isWall = prng.next() > 0.8; // 20% Obstacles
                const type: TileType = isWall ? 'WALL' : 'CONCRETE';

                // Metadata generation
                const metadata: TileMetadata = {
                    noiseCoefficient: type === 'CONCRETE' ? 1.0 : 0.0,
                    spawnWeight: 1.0,
                    isInteractable: false,
                    opacity: isWall ? 1.0 : 0.0,
                    walkable: !isWall,
                };

                row.push({
                    coordinate: { x, y, floor: z },
                    type,
                    metadata,
                });
            }
            floorLayer.push(row);
        }
        floors.push(floorLayer);
    }

    // Post-processing: Ensure 5x5 start area is clear on 1st Floor
    const centerX = Math.floor(MAP_WIDTH / 2);
    const centerY = Math.floor(MAP_HEIGHT / 2);

    // Clear start area (Floor 0)
    for (let x = centerX - 2; x <= centerX + 2; x++) {
        for (let y = centerY - 2; y <= centerY + 2; y++) {
            if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
                const tile = floors[0][x][y];
                if (tile) {
                    tile.type = 'CONCRETE';
                    tile.metadata.walkable = true;
                    tile.metadata.opacity = 0;
                }
            }
        }
    }

    // --- STAIRS GENERATION ---
    // Place stairs roughly away from center
    let sx = centerX, sy = centerY;
    while (Math.abs(sx - centerX) < 5 && Math.abs(sy - centerY) < 5) {
        sx = prng.range(1, MAP_WIDTH - 2);
        sy = prng.range(1, MAP_HEIGHT - 2);
    }

    // Floor 0: Up
    floors[0][sx][sy].type = 'STAIRS_UP';
    floors[0][sx][sy].metadata.walkable = true;
    floors[0][sx][sy].metadata.opacity = 0;

    // Floor 1: Down
    floors[1][sx][sy].type = 'STAIRS_DOWN';
    floors[1][sx][sy].metadata.walkable = true;
    floors[1][sx][sy].metadata.opacity = 0;


    // Spawn Player
    const player: Unit = {
        id: 'player-1',
        type: 'PLAYER',
        faction: 'PLAYER',
        name: 'Survivor',
        position: { x: centerX, y: centerY, floor: 0 },
        status: {
            hp: 100,
            maxHp: 100,
            ap: 10,
            maxAp: 10,
            apRecovery: 5,
            sightRange: 10,
            isInjured: false,
            noiseLevel: 3
        },
        facing: 'DOWN'
    };

    const units: Record<string, Unit> = {};
    units[player.id] = player;

    // Spawn Enemies (Simple random placement far from player)
    const enemyCount = 3 + Math.floor(prng.next() * 3); // 3 to 5 enemies
    let enemiesSpawned = 0;

    // Safety break
    let attempts = 0;
    while (enemiesSpawned < enemyCount && attempts < 100) {
        attempts++;
        const x = Math.floor(prng.next() * MAP_WIDTH);
        const y = Math.floor(prng.next() * MAP_HEIGHT);

        // Calculate distance from player
        const dist = Math.abs(x - centerX) + Math.abs(y - centerY);

        // Check tile valid
        const tile = floors[0][x][y];

        // Check occupancy
        const isOccupied = Object.values(units).some(u => u.position.x === x && u.position.y === y && u.position.floor === 0);

        // Spawn only on walkable tiles and far enough (e.g. > 6 tiles)
        if (tile && tile.metadata.walkable && dist > 6 && !isOccupied) {
            const enemyId = `biter-${enemiesSpawned}`;
            units[enemyId] = {
                id: enemyId,
                type: 'ENEMY',
                faction: 'ENEMY',
                name: 'Biter',
                position: { x, y, floor: 0 },
                status: {
                    hp: 3, // Low HP (Fragile)
                    maxHp: 3,
                    ap: 8, // Less AP than player
                    maxAp: 8,
                    apRecovery: 4,
                    sightRange: 7, // 7 tiles detection
                    isInjured: false
                },
                facing: 'DOWN'
            };
            enemiesSpawned++;
        }
    }

    return {
        floor: floors,
        units
    };
};
