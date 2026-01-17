import type { Coordinate, FloorData, Unit } from './types';

interface Node {
    x: number;
    y: number;
    f: number;
    g: number;
    h: number;
    parent: Node | null;
}

const DIRECTIONS = [
    { dx: 1, dy: 0, cost: 1.0 },
    { dx: 1, dy: 1, cost: 1.5 },
    { dx: 0, dy: 1, cost: 1.0 },
    { dx: -1, dy: 1, cost: 1.5 },
    { dx: -1, dy: 0, cost: 1.0 },
    { dx: -1, dy: -1, cost: 1.5 },
    { dx: 0, dy: -1, cost: 1.0 },
    { dx: 1, dy: -1, cost: 1.5 },
];

function getHeuristic(a: Coordinate, b: Coordinate): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return (dx + dy) + (1.5 - 2) * Math.min(dx, dy);
}

export const findPath = (
    start: Coordinate,
    end: Coordinate,
    floor: FloorData,
    units: Unit[],
    moverId: string
): Coordinate[] | null => {
    const z = start.floor;
    const floorMap = floor[z];

    if (!floorMap) return null;

    if (end.x < 0 || end.x >= floorMap.length || end.y < 0 || end.y >= floorMap[0].length) return null;
    if (!floorMap[end.x][end.y].metadata.walkable) return null;

    const startNode: Node = { x: start.x, y: start.y, g: 0, h: 0, f: 0, parent: null };
    const openList: Node[] = [startNode];
    const closedList = new Set<string>();

    const mover = units.find(u => u.id === moverId);
    if (!mover) return null;

    while (openList.length > 0) {
        openList.sort((a, b) => a.f - b.f);
        const current = openList.shift()!;
        const currentKey = `${current.x},${current.y}`;

        if (current.x === end.x && current.y === end.y) {
            const path: Coordinate[] = [];
            let curr: Node | null = current;
            while (curr) {
                path.unshift({ x: curr.x, y: curr.y, floor: z });
                curr = curr.parent;
            }
            return path;
        }

        closedList.add(currentKey);

        for (const dir of DIRECTIONS) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;

            if (nx < 0 || nx >= floorMap.length || ny < 0 || ny >= floorMap[0].length) continue;
            if (!floorMap[nx][ny].metadata.walkable) continue;

            const nKey = `${nx},${ny}`;
            if (closedList.has(nKey)) continue;

            let moveCost = dir.cost;
            const occupier = units.find(u => u.position.x === nx && u.position.y === ny && u.position.floor === z && u.id !== moverId);

            if (occupier) {
                if (nx === end.x && ny === end.y) {
                    continue; // Destination blocked
                }

                if (mover.type === 'PLAYER' && occupier.type === 'ENEMY') {
                    moveCost = 3;
                } else {
                    continue; // Blocked
                }
            }

            const gScore = current.g + moveCost;
            const existing = openList.find(n => n.x === nx && n.y === ny);

            if (existing && gScore >= existing.g) continue;

            const hScore = getHeuristic({ x: nx, y: ny, floor: z }, end);
            const newNode: Node = {
                x: nx,
                y: ny,
                g: gScore,
                h: hScore,
                f: gScore + hScore,
                parent: current
            };

            if (existing) {
                existing.g = gScore;
                existing.f = gScore + hScore;
                existing.parent = current;
            } else {
                openList.push(newNode);
            }
        }
    }

    return null;
};
