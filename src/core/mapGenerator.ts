import type { FloorData, Tile, TileType, TileMetadata } from './types';

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
const FLOORS = 1; // Start with 1 floor, expandable to 3D

export const generateMap = (seed: number): FloorData => {
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

    // Post-processing: Ensure 5x5 start area is clear (for consistency)
    // Center is roughly 10,10 based on MAP_WIDTH
    const centerX = Math.floor(MAP_WIDTH / 2);
    const centerY = Math.floor(MAP_HEIGHT / 2);

    for (let x = centerX - 2; x <= centerX + 2; x++) {
        for (let y = centerY - 2; y <= centerY + 2; y++) {
            const tile = floors[0][x][y];
            if (tile) {
                tile.type = 'CONCRETE';
                tile.metadata.walkable = true;
                tile.metadata.opacity = 0;
            }
        }
    }

    return floors;
};
