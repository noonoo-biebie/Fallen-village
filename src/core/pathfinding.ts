import type { Coordinate, FloorData, Tile } from './types';

interface Node {
    x: number;
    y: number;
    f: number; // Total cost (g + h)
    g: number; // Cost from start
    h: number; // Heuristic to end
    parent: Node | null;
}

// Directions: 8-way (Right, Down-Right, Down, Down-Left, Left, Up-Left, Up, Up-Right)
// dx, dy, cost
const DIRECTIONS = [
    { dx: 1, dy: 0, cost: 1.0 },   // Right
    { dx: 1, dy: 1, cost: 1.5 },   // Down-Right
    { dx: 0, dy: 1, cost: 1.0 },   // Down
    { dx: -1, dy: 1, cost: 1.5 },  // Down-Left
    { dx: -1, dy: 0, cost: 1.0 },  // Left
    { dx: -1, dy: -1, cost: 1.5 }, // Up-Left
    { dx: 0, dy: -1, cost: 1.0 },  // Up
    { dx: 1, dy: -1, cost: 1.5 },  // Up-Right
];

function getHeuristic(a: Coordinate, b: Coordinate): number {
    // Octile distance for 8-way movement
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return (dx + dy) + (1.5 - 2) * Math.min(dx, dy);
}

// dynamicObstacles: Coordinates of units.
// Rule: Moving THROUGH a unit costs 2 extra AP? Or set cost TO 2?
// User said: "적이 있는 칸을 넘어 갈때는 2AP가 소모되는 거야" (Passing through costs 2AP).
// And "대신 적이 있는 칸을 목표로 할 수는 없어" (Can't end on unit).

export const findPath = (
    start: Coordinate,
    end: Coordinate,
    floorData: FloorData,
    dynamicObstacles: Coordinate[] = []
): Coordinate[] | null => {
    // Assume generic movement on correct floor Z
    const z = start.floor;
    const floorMap = floorData[z];

    if (!floorMap) return null; // Floor not found

    // Bounds check
    if (end.x < 0 || end.x >= floorMap.length || end.y < 0 || end.y >= floorMap[0].length) {
        return null;
    }

    // Target check (Static)
    if (!floorMap[end.x][end.y].metadata.walkable) {
        return null;
    }

    // Target check (Dynamic)
    // CANNOT end on a unit
    if (dynamicObstacles.some(b => b.x === end.x && b.y === end.y && b.floor === z)) {
        return null;
    }

    const openList: Node[] = [];
    const closedSet = new Set<string>();

    // Initialize start node
    openList.push({
        x: start.x,
        y: start.y,
        f: 0,
        g: 0,
        h: 0,
        parent: null
    });

    while (openList.length > 0) {
        // Get node with lowest f
        openList.sort((a, b) => a.f - b.f);
        const current = openList.shift()!;

        // Check goal
        if (current.x === end.x && current.y === end.y) {
            // Reconstruct path
            const path: Coordinate[] = [];
            let curr: Node | null = current;
            while (curr) {
                path.unshift({ x: curr.x, y: curr.y, floor: z });
                curr = curr.parent;
            }
            return path; // Returns full path including start
        }

        const key = `${current.x},${current.y}`;
        if (closedSet.has(key)) continue;
        closedSet.add(key);

        // Neighbors
        for (const dir of DIRECTIONS) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;

            // Check bounds
            if (nx < 0 || nx >= floorMap.length || ny < 0 || ny >= floorMap[0].length) continue;

            // Check walkable
            if (!floorMap[nx][ny].metadata.walkable) continue;

            if (closedSet.has(`${nx},${ny}`)) continue;

            // COST CALCULATION
            let moveCost = dir.cost;

            // Check if blocked by unit (Dynamic Obstacle)
            const isOccupied = dynamicObstacles.some(b => b.x === nx && b.y === ny && b.floor === z);
            if (isOccupied) {
                // If occupied, we can pass through BUT cost is handled here.
                // User said: "consumes 2AP". Is it +2 or =2?
                // Context: "적이 있는 칸을 넘어 갈때는 2AP가 소모".
                // Usually diagonal is 1.5, straight is 1.
                // If we set it to 2, it's roughly double.
                // Let's assume the cost of entering that tile becomes 2.0 regardless of angle?
                // Or adds surcharge? Let's verify interpretation.
                // "2AP가 소모되는 거야" -> The cost of that step is 2.
                // So moveCost = 2.0.
                moveCost = 2.0;

                // Also, if this is the END node, we already returned null above.
                // So we are just passing through here.
            }

            const gScore = current.g + moveCost;
            const hScore = getHeuristic({ x: nx, y: ny, floor: z }, end);

            // Check if node is already in openList with better g
            const existing = openList.find(n => n.x === nx && n.y === ny);
            if (existing) {
                if (gScore < existing.g) {
                    existing.g = gScore;
                    existing.f = gScore + existing.h;
                    existing.parent = current;
                }
            } else {
                openList.push({
                    x: nx,
                    y: ny,
                    f: gScore + hScore,
                    g: gScore,
                    h: hScore,
                    parent: current
                });
            }
        }
    }

    return null; // No path found
};
