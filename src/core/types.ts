export type Coordinate = {
  x: number;
  y: number;
  floor: number;
};

export type TileType = 'EMPTY' | 'CONCRETE' | 'MUD' | 'STAIRS' | 'WALL';

export type TileMetadata = {
  noiseCoefficient: number; // 1.0 = normal, >1.0 = loud (e.g. mud/glass), <1.0 = quiet
  spawnWeight: number;      // Probability of enemy spawn
  isInteractable: boolean;
  opacity: number;          // 0 = transparent, 1 = opaque (blocks vision)
  walkable: boolean;
};

export type Tile = {
  coordinate: Coordinate;
  type: TileType;
  metadata: TileMetadata;
};

export type FloorData = Tile[][][]; // [z][x][y]

export type UnitStatus = {
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  isInjured: boolean; // Increases noise, movement cost
};

export type Unit = {
  id: string;
  type: 'PLAYER' | 'ENEMY';
  name: string;
  position: Coordinate;
  status: UnitStatus;
  facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // For sprite direction
};

export type Action = {
  id: string;
  type: 'MOVE' | 'WAIT' | 'INTERACT';
  unitId: string;
  target?: Coordinate;
  cost: number;
  status: 'QUEUED' | 'EXECUTING' | 'COMPLETED';
};

export type GamePhase = 'DECISION' | 'EXECUTION';

export interface GameState {
  floor: FloorData;
  units: Record<string, Unit>;
  phase: GamePhase;
  timer: number;
  actionQueue: Action[];
  seed: number;
}
