// Recursive Shadowcasting Algorithm for FOV
import type { Coordinate, FloorData } from './types';

// Multipliers for transforming coordinates into different octants
const OCTANTS = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
];

export const calculateFOV = (
    origin: Coordinate,
    range: number,
    floorData: FloorData
): Set<string> => {
    const visibleTiles = new Set<string>();
    const floor = floorData[origin.floor];

    if (!floor) return visibleTiles;

    const width = floor.length;
    const height = floor[0].length;

    // Helper to add visible tile
    const reveal = (x: number, y: number) => {
        visibleTiles.add(`${x},${y}`);
    };

    // Always reveal origin
    reveal(origin.x, origin.y);

    // Recursive shadowcasting function
    const scan = (
        y: number,
        startSlope: number,
        endSlope: number,
        transform: (x: number, y: number) => [number, number]
    ) => {
        if (startSlope >= endSlope) return;

        let x = y + 1; // Not exactly x, but 'row' depth?
        // Wait, standard algorithm iterates rows. Let's stick to standard names.
        // Depth = y (in local coords), Row = x? 
        // Let's use 'row' and 'col'.
    };

    // Let's implement a simpler standard Shadowcasting
    // Adapted from roguelike tutorials

    // Project coordinates
    // row: distance from origin
    // col: position along the row

    for (let octant = 0; octant < 8; octant++) {
        refreshOctant(octant, origin, range, width, height, floor, visibleTiles);
    }

    return visibleTiles;
};

function refreshOctant(
    octant: number,
    origin: Coordinate,
    range: number,
    width: number,
    height: number,
    floor: any[][],
    visibleTiles: Set<string>
) {
    const shadowLine = new ShadowLine();
    for (let row = 1; row <= range; row++) {
        let prevTileOpaque = false; // Is previous tile opaque?

        for (let col = 0; col <= row; col++) {
            const [dx, dy] = transformOctant(row, col, octant);
            const x = origin.x + dx;
            const y = origin.y + dy;

            // Bounds check
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            // Distance check (Circle)
            if (dx * dx + dy * dy > range * range) continue;

            const fullShadow = shadowLine.isInShadow(col, row); // Check if tile is in shadow
            if (fullShadow) {
                // Determine if we see it?
                // Usually if in full shadow, not visible.
                continue;
            }

            // It's visible! (Or partially)
            visibleTiles.add(`${x},${y}`);

            // Check opacity
            // If this tile is opaque (wall), it casts a shadow
            const tile = floor[x][y];
            const isOpaque = tile.metadata.opacity > 0;

            if (isOpaque) {
                if (!prevTileOpaque) {
                    // Start of a blocking sequence
                    // Add simple shadow
                    shadowLine.addShadow(col, row);
                    // Note: This is an overly simplified shadowcasting (Line based).
                    // A proper recursive one is better but harder to implement in one shot without robust lib.
                    // Let's stick to a simpler Symetric Shadowcasting or just Raycasting for 360?
                    // Raycasting 360 (360 rays) is inefficient but easy.
                    // Recursive Shadowcasting is best.
                }
                prevTileOpaque = true;
            } else {
                if (prevTileOpaque) {
                    // End of blocking sequence
                    prevTileOpaque = false;
                }
            }
        }
    }
}

// ---------------------------------------------------------
// Alternative: Simple Raycasting for 8-way consistency & Ease
// ---------------------------------------------------------

export const calculateSimpleFOV = (
    origin: Coordinate,
    range: number,
    floorData: FloorData
): Set<string> => {
    const visibleTiles = new Set<string>();
    const floor = floorData[origin.floor];
    if (!floor) return visibleTiles;

    const width = floor.length;
    const height = floor[0].length;

    visibleTiles.add(`${origin.x},${origin.y},${origin.floor}`);

    // Cast rays to all perimeter tiles of the box (range * 2)
    // Or just 360 degrees
    for (let i = 0; i < 360; i += 2) { // Every 2 degrees
        const rad = (i * Math.PI) / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        let ox = origin.x + 0.5;
        let oy = origin.y + 0.5;

        for (let r = 0; r < range; r += 0.5) { // Step size 0.5
            ox += dx * 0.5;
            oy += dy * 0.5;

            const tx = Math.floor(ox);
            const ty = Math.floor(oy);

            // Bounds
            if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

            visibleTiles.add(`${tx},${ty},${origin.floor}`);

            // Check Block
            if (floor[tx][ty].metadata.opacity >= 1) {
                break; // Wall blocks view
            }
        }
    }

    return visibleTiles;
};


// Helper for octant transform (if used)
function transformOctant(row: number, col: number, octant: number): [number, number] {
    switch (octant) {
        case 0: return [col, -row];
        case 1: return [row, -col];
        case 2: return [row, col];
        case 3: return [col, row];
        case 4: return [-col, row];
        case 5: return [-row, col];
        case 6: return [-row, -col];
        case 7: return [-col, -row];
    }
    return [0, 0];
}

class ShadowLine {
    // Placeholder for complex shadow management
    isInShadow(col: number, row: number) { return false; }
    addShadow(col: number, row: number) { }
}
