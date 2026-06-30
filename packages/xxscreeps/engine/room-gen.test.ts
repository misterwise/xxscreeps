import type { ExitMap } from 'xxscreeps/engine/room-gen.js';
import type { HighwayOrientation } from 'xxscreeps/game/room/sector.js';
import {
	checkFlood, exitsArray, genExit, genHighwayTerrain, genTerrain, generateRoom,
	generateSector, gridToTerrain, hasPassableNeighbor, makeGrid, mineralPool,
	pickMineralDensity, pickMineralPosition,
} from 'xxscreeps/engine/room-gen.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { StructureExtractor } from 'xxscreeps/mods/mineral/extractor.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { StructureKeeperLair } from 'xxscreeps/mods/source/keeper-lair.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';

const { shard } = await instantiateTestShard();

describe('room generation', () => {
	describe('terrain internals', () => {
		test('checkFlood accepts fully connected terrain', () => {
			const grid = makeGrid();
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					row[xx]!.wall = xx === 0 || xx === 49 || yy === 0 || yy === 49;
				}
			}
			assert.ok(checkFlood(grid));
		});

		test('checkFlood rejects disconnected terrain', () => {
			const grid = makeGrid();
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					row[xx]!.wall = xx === 0 || xx === 49 || yy === 0 || yy === 49 || xx === 25;
				}
			}
			assert.ok(!checkFlood(grid));
		});

		test('genExit produces valid exit positions', () => {
			for (let ii = 0; ii < 20; ii++) {
				const exit = genExit();
				assert.ok(exit.length > 0, 'Exit must have at least one tile');
				for (const pos of exit) {
					assert.ok(pos >= 2 && pos <= 47, `Exit position ${pos} must be in range [2, 47]`);
				}
			}
		});

		test('genTerrain produces connected terrain with no walls on exits', () => {
			const exits = { top: [ 10, 11, 12 ], right: [ 20, 21 ], bottom: [ 30, 31, 32 ], left: [ 15 ] };
			const grid = genTerrain(exits, { wallType: 1, swampType: 0, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
			assert.ok(checkFlood(grid));

			for (const xx of exits.top) {
				assert.ok(!grid[0]![xx]!.wall, `Top exit at x=${xx} should not be wall`);
			}
			for (const yy of exits.right) {
				assert.ok(!grid[yy]![49]!.wall, `Right exit at y=${yy} should not be wall`);
			}
			for (const xx of exits.bottom) {
				assert.ok(!grid[49]![xx]!.wall, `Bottom exit at x=${xx} should not be wall`);
			}
			for (const yy of exits.left) {
				assert.ok(!grid[yy]![0]!.wall, `Left exit at y=${yy} should not be wall`);
			}
		});

		test('genTerrain produces terrain for all 28 wall types', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			for (let wallType = 1; wallType <= 28; wallType++) {
				const grid = genTerrain(exits, { wallType, swampType: 0, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
				assert.ok(checkFlood(grid), `Wall type ${wallType} must produce connected terrain`);
			}
		});

		test('genTerrain with swamp types preserves connectivity', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			for (let swampType = 1; swampType <= 14; swampType++) {
				const grid = genTerrain(exits, { wallType: 5, swampType, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
				assert.ok(checkFlood(grid), `Swamp type ${swampType} must not break connectivity`);
			}
		});

		test('gridToTerrain encodes walls correctly', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 1, swampType: 3, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
			const terrain = gridToTerrain(grid);
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					if (row[xx]!.wall) {
						assert.strictEqual(terrain.get(xx, yy), C.TERRAIN_MASK_WALL, `(${xx},${yy}) should be wall`);
					}
				}
			}
		});

		test('empty exits produce walls on all borders', () => {
			const exits = { top: [] as number[], right: [] as number[], bottom: [] as number[], left: [] as number[] };
			const grid = genTerrain(exits, { wallType: 1, swampType: 0, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
			for (let ii = 0; ii < 50; ii++) {
				assert.ok(grid[0]![ii]!.wall, `Top border (${ii},0) should be wall`);
				assert.ok(grid[49]![ii]!.wall, `Bottom border (${ii},49) should be wall`);
				assert.ok(grid[ii]![0]!.wall, `Left border (0,${ii}) should be wall`);
				assert.ok(grid[ii]![49]!.wall, `Right border (49,${ii}) should be wall`);
			}
		});

		test('gridToTerrain only encodes swamps with non-wall neighbors', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 6, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
			const terrain = gridToTerrain(grid);

			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					const cell = row[xx]!;
					if (terrain.get(xx, yy) === C.TERRAIN_MASK_SWAMP) {
						assert.ok(cell.swamp, `Encoded swamp at (${xx},${yy}) must have swamp=true in grid`);
						assert.ok(!cell.wall, `Encoded swamp at (${xx},${yy}) must not be wall`);
						assert.ok(hasPassableNeighbor(grid, xx, yy),
							`Encoded swamp at (${xx},${yy}) must have non-wall neighbor`);
					}
				}
			}
		});

		test('gridToTerrain drops swamps that are fully surrounded by walls', () => {
			const grid = makeGrid();
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					row[xx]!.wall = true;
				}
			}
			grid[25]![25]!.wall = false;
			grid[25]![25]!.swamp = true;
			grid[25]![26]!.wall = false;
			grid[10]![10]!.swamp = true;
			grid[10]![10]!.wall = true;

			const terrain = gridToTerrain(grid);
			assert.strictEqual(terrain.get(25, 25), C.TERRAIN_MASK_SWAMP, 'Swamp with passable neighbor kept');
			assert.strictEqual(terrain.get(10, 10), C.TERRAIN_MASK_WALL, 'Wall tile stays wall');
		});

		test('exitsArray extracts exit positions from a generated terrain', () => {
			const exits = { top: [ 10, 11, 20 ], right: [ 15, 16, 30 ], bottom: [ 25 ], left: [ 5, 40 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 0, controller: false, keeperLairs: false, mineral: false });
			const terrain = gridToTerrain(grid);

			const topExits = exitsArray(terrain, 'y', 0);
			for (const xx of exits.top) {
				assert.ok(topExits.includes(xx), `Top exit x=${xx} should be extracted`);
			}
			const rightExits = exitsArray(terrain, 'x', 49);
			for (const yy of exits.right) {
				assert.ok(rightExits.includes(yy), `Right exit y=${yy} should be extracted`);
			}
		});
	});

	describe('object placement', () => {
		test('sources placed on wall tiles with passable neighbor', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 2, controller: false, keeperLairs: false, mineral: false });
			let sourceCount = 0;
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					const cell = row[xx]!;
					if (cell.source) {
						sourceCount++;
						assert.ok(cell.wall, `Source at (${xx},${yy}) should be on wall tile`);
						assert.ok(hasPassableNeighbor(grid, xx, yy),
							`Source at (${xx},${yy}) must have passable neighbor`);
					}
				}
			}
			assert.strictEqual(sourceCount, 2);
		});

		test('three-source rooms spread their sources, not cluster them', () => {
			// Keeper/center rooms (three sources, no controller) spread their sources across the room;
			// a single random-wall-tile loop clusters them instead. Sample varied terrain and assert the
			// spread holds: no near-adjacent pair, and a wide median separation.
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const cheb = (one: [ number, number ], two: [ number, number ]) =>
				Math.max(Math.abs(one[0] - two[0]), Math.abs(one[1] - two[1]));
			const mins: number[] = [];
			for (let iteration = 0; iteration < 150; iteration++) {
				const grid = genTerrain(exits, { wallType: (iteration % 27) + 1, swampType: iteration % 14, sourceCount: 3, controller: false, keeperLairs: false, mineral: false });
				const sources: [ number, number ][] = [];
				for (let yy = 0; yy < 50; yy++) {
					for (let xx = 0; xx < 50; xx++) {
						if (grid[yy]![xx]!.source) sources.push([ xx, yy ]);
					}
				}
				assert.strictEqual(sources.length, 3);
				let min = Infinity;
				for (let ii = 0; ii < 3; ii++) {
					for (let jj = ii + 1; jj < 3; jj++) {
						min = Math.min(min, cheb(sources[ii]!, sources[jj]!));
					}
				}
				assert.ok(min >= 5, `three sources clustered (min Chebyshev ${min}) — should be spread`);
				mins.push(min);
			}
			mins.sort((lhs, rhs) => lhs - rhs);
			const median = mins[Math.floor(mins.length / 2)]!;
			assert.ok(median >= 18, `three-source spread median ${median} below the real world's ~25`);
		});

		test('controller on wall tile, not overlapping source', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 2, controller: true, keeperLairs: false, mineral: false });
			let controllerCount = 0;
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					const cell = row[xx]!;
					if (cell.controller) {
						controllerCount++;
						assert.ok(cell.wall, `Controller at (${xx},${yy}) should be on wall tile`);
						assert.ok(!cell.source, 'Controller should not overlap source');
						assert.ok(hasPassableNeighbor(grid, xx, yy),
							`Controller at (${xx},${yy}) must have passable neighbor`);
					}
				}
			}
			assert.strictEqual(controllerCount, 1);
		});

		test('keeper lairs placed near sources, on wall, not on border', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 2, controller: false, keeperLairs: true, mineral: false });
			const sources: [ number, number ][] = [];
			const lairs: [ number, number ][] = [];
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					const cell = row[xx]!;
					if (cell.source) sources.push([ xx, yy ]);
					if (cell.keeperLair) lairs.push([ xx, yy ]);
				}
			}
			assert.strictEqual(sources.length, 2);
			assert.strictEqual(lairs.length, 2, 'Each source should have a keeper lair');
			for (const [ lairXx, lairYy ] of lairs) {
				assert.ok(grid[lairYy]![lairXx]!.wall, `Lair at (${lairXx},${lairYy}) should be on wall tile`);
				assert.ok(lairXx > 0 && lairXx < 49 && lairYy > 0 && lairYy < 49,
					`Lair at (${lairXx},${lairYy}) should not be on border`);
			}
		});

		test('source count of 1 honored', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 1, controller: false, keeperLairs: false, mineral: false });
			let sourceCount = 0;
			for (let yy = 0; yy < 50; yy++) {
				const row = grid[yy]!;
				for (let xx = 0; xx < 50; xx++) {
					if (row[xx]!.source) sourceCount++;
				}
			}
			assert.strictEqual(sourceCount, 1);
		});
	});

	describe('mineral placement', () => {
		test('pickMineralPosition returns wall tile with passable neighbor', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 2, controller: true, keeperLairs: false, mineral: false });
			const { xx, yy } = pickMineralPosition(grid);
			assert.ok(grid[yy]![xx]!.wall, `Mineral at (${xx},${yy}) should be on wall`);
			assert.ok(hasPassableNeighbor(grid, xx, yy), `Mineral at (${xx},${yy}) must have passable neighbor`);
		});

		test('pickMineralPosition stays at least 5 tiles from sources and controller', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 2, controller: true, keeperLairs: false, mineral: false });
			for (let trial = 0; trial < 20; trial++) {
				const { xx: mxx, yy: myy } = pickMineralPosition(grid);
				for (let yy = 0; yy < 50; yy++) {
					const row = grid[yy]!;
					for (let xx = 0; xx < 50; xx++) {
						const cell = row[xx]!;
						if (cell.source || cell.controller) {
							const dxx = Math.abs(xx - mxx);
							const dyy = Math.abs(yy - myy);
							assert.ok(dxx >= 5 || dyy >= 5,
								`Mineral at (${mxx},${myy}) too close to object at (${xx},${yy}): dxx=${dxx}, dyy=${dyy}`);
						}
					}
				}
			}
		});

		test('pickMineralPosition stays within interior bounds (4-45)', () => {
			const exits = { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 25 ] };
			const grid = genTerrain(exits, { wallType: 5, swampType: 0, sourceCount: 1, controller: true, keeperLairs: false, mineral: false });
			for (let trial = 0; trial < 20; trial++) {
				const { xx, yy } = pickMineralPosition(grid);
				assert.ok(xx >= 4 && xx <= 45, `Mineral x=${xx} must be in [4,45]`);
				assert.ok(yy >= 4 && yy <= 45, `Mineral y=${yy} must be in [4,45]`);
			}
		});

		test('pickMineralDensity returns a valid density (1-4)', () => {
			for (let ii = 0; ii < 100; ii++) {
				const density = pickMineralDensity();
				assert.ok(density >= 1 && density <= 4, `Density ${density} must be in [1,4]`);
				assert.ok(C.MINERAL_DENSITY[density] !== undefined, `Density ${density} must have a valid amount`);
			}
		});

		test('mineralPool contains all vanilla mineral types', () => {
			const unique = new Set(mineralPool);
			assert.ok(unique.has(C.RESOURCE_HYDROGEN), 'pool has H');
			assert.ok(unique.has(C.RESOURCE_OXYGEN), 'pool has O');
			assert.ok(unique.has(C.RESOURCE_ZYNTHIUM), 'pool has Z');
			assert.ok(unique.has(C.RESOURCE_KEANIUM), 'pool has K');
			assert.ok(unique.has(C.RESOURCE_UTRIUM), 'pool has U');
			assert.ok(unique.has(C.RESOURCE_LEMERGIUM), 'pool has L');
			assert.ok(unique.has(C.RESOURCE_CATALYST), 'pool has X');
			assert.strictEqual(unique.size, 7, 'exactly 7 mineral types');
		});
	});

	describe('generateRoom integration', () => {
		test('generates room with objects and persists', async () => {
			const room = await generateRoom(shard, 'W20N20', {
				terrainType: 5, swampType: 3, sources: 2,
				controller: true, mineral: C.RESOURCE_HYDROGEN,
			});
			assert.strictEqual(room.name, 'W20N20');

			const rooms = await shard.data.sMembers('rooms');
			assert.ok(rooms.includes('W20N20'), 'Room should be registered');

			const loaded = await shard.loadRoom('W20N20', shard.time, true);
			assert.strictEqual(loaded.name, 'W20N20');

			const sources = loaded['#objects'].filter((object): object is Source => object instanceof Source);
			const minerals = loaded['#objects'].filter((object): object is Mineral => object instanceof Mineral);
			const controllers = loaded['#objects'].filter((object): object is StructureController => object instanceof StructureController);

			assert.strictEqual(sources.length, 2, 'should have 2 sources');
			assert.strictEqual(minerals.length, 1, 'should have 1 mineral');
			assert.strictEqual(controllers.length, 1, 'should have 1 controller');

			for (const source of sources) {
				assert.strictEqual(source.energy, C.SOURCE_ENERGY_NEUTRAL_CAPACITY, 'source at neutral capacity');
				assert.strictEqual(source.energyCapacity, C.SOURCE_ENERGY_NEUTRAL_CAPACITY);
			}

			const mineral = minerals[0]!;
			assert.strictEqual(mineral.mineralType, C.RESOURCE_HYDROGEN);
			assert.ok(mineral.density >= 1 && mineral.density <= 4, 'mineral density in [1,4]');
			assert.strictEqual(mineral.mineralAmount, C.MINERAL_DENSITY[mineral.density]);

			assert.strictEqual(controllers[0]!['#user'], null, 'controller is unowned');

			const world = await shard.loadWorld();
			assert.ok(world.terrain.has('W20N20'), 'World terrain should include new room');
		});

		test('mineral: false omits the mineral', async () => {
			const room = await generateRoom(shard, 'W21N21', {
				sources: 1, controller: true, mineral: false,
			});
			const loaded = await shard.loadRoom(room.name, shard.time, true);
			const minerals = loaded['#objects'].filter(object => object instanceof Mineral);
			assert.strictEqual(minerals.length, 0, 'no mineral when mineral:false');
		});

		test('controller: false omits the controller', async () => {
			const room = await generateRoom(shard, 'W22N22', {
				sources: 1, controller: false, mineral: false,
			});
			const loaded = await shard.loadRoom(room.name, shard.time, true);
			const controllers = loaded['#objects'].filter(object => object instanceof StructureController);
			assert.strictEqual(controllers.length, 0, 'no controller when controller:false');
		});

		test('sources: 1 produces exactly one source', async () => {
			const room = await generateRoom(shard, 'W23N23', {
				sources: 1, controller: true, mineral: false,
			});
			const loaded = await shard.loadRoom(room.name, shard.time, true);
			const sources = loaded['#objects'].filter(object => object instanceof Source);
			assert.strictEqual(sources.length, 1);
		});

		test('source-keeper room: 3 guarded sources, guarded mineral, unowned extractor, no controller', async () => {
			const room = await generateRoom(shard, 'W26N26', {
				controller: false, sources: 3, keeperLairs: true, extractor: true, mineral: C.RESOURCE_OXYGEN,
			});
			const loaded = await shard.loadRoom(room.name, shard.time, true);
			const sources = loaded['#objects'].filter((object): object is Source => object instanceof Source);
			const minerals = loaded['#objects'].filter(object => object instanceof Mineral);
			const lairs = loaded['#objects'].filter(object => object instanceof StructureKeeperLair);
			const controllers = loaded['#objects'].filter(object => object instanceof StructureController);
			const extractors = loaded['#objects'].filter((object): object is StructureExtractor => object instanceof StructureExtractor);

			assert.strictEqual(sources.length, 3, '3 sources');
			for (const source of sources) {
				assert.strictEqual(source.energyCapacity, C.SOURCE_ENERGY_KEEPER_CAPACITY, 'keeper-room source holds 4000');
				assert.strictEqual(source.energy, C.SOURCE_ENERGY_KEEPER_CAPACITY);
			}
			assert.strictEqual(minerals.length, 1, '1 mineral');
			assert.strictEqual(lairs.length, 4, 'one keeper lair per source plus the mineral');
			assert.strictEqual(extractors.length, 1, '1 extractor');
			assert.strictEqual(controllers.length, 0, 'no controller');
			assert.strictEqual(extractors[0]!['#user'], null, 'extractor is unowned so any player can harvest');
		});

		test('center room: 3 sources, mineral, unowned extractor, no lairs or controller', async () => {
			const room = await generateRoom(shard, 'W27N27', {
				controller: false, sources: 3, keeperLairs: false, extractor: true, mineral: C.RESOURCE_KEANIUM,
			});
			const loaded = await shard.loadRoom(room.name, shard.time, true);
			const sources = loaded['#objects'].filter((object): object is Source => object instanceof Source);
			const minerals = loaded['#objects'].filter(object => object instanceof Mineral);
			const lairs = loaded['#objects'].filter(object => object instanceof StructureKeeperLair);
			const controllers = loaded['#objects'].filter(object => object instanceof StructureController);
			const extractors = loaded['#objects'].filter(object => object instanceof StructureExtractor);

			assert.strictEqual(sources.length, 3, '3 sources');
			for (const source of sources) {
				assert.strictEqual(source.energyCapacity, C.SOURCE_ENERGY_KEEPER_CAPACITY, 'center-room source holds 4000');
				assert.strictEqual(source.energy, C.SOURCE_ENERGY_KEEPER_CAPACITY);
			}
			assert.strictEqual(minerals.length, 1, '1 mineral');
			assert.strictEqual(extractors.length, 1, '1 extractor');
			assert.strictEqual(lairs.length, 0, 'no keeper lairs');
			assert.strictEqual(controllers.length, 0, 'no controller');
		});

		test('rejects duplicate room name', async () => {
			await generateRoom(shard, 'W25N25', { sources: 1, controller: true, mineral: false });
			await assert.rejects(
				() => generateRoom(shard, 'W25N25'),
				/already exists/,
			);
		});

		test('rejects invalid room name', async () => {
			await assert.rejects(
				() => generateRoom(shard, 'invalid'),
				/Invalid room name/,
			);
		});

		test('matches exits with neighbor on all 4 directions', async () => {
			await generateRoom(shard, 'W30N30', {
				sources: 1, controller: true, mineral: false,
				exits: { top: [ 20, 21, 22 ], right: [ 25, 26 ], bottom: [ 15, 16 ], left: [ 30, 31 ] },
			});

			await generateRoom(shard, 'W30N31', { sources: 1, controller: true, mineral: false });
			await generateRoom(shard, 'W29N30', { sources: 1, controller: true, mineral: false });
			await generateRoom(shard, 'W30N29', { sources: 1, controller: true, mineral: false });
			await generateRoom(shard, 'W31N30', { sources: 1, controller: true, mineral: false });

			const world = await shard.loadWorld();
			const center = world.terrain.get('W30N30')!;
			const top = world.terrain.get('W30N31')!;
			const right = world.terrain.get('W29N30')!;
			const bottom = world.terrain.get('W30N29')!;
			const left = world.terrain.get('W31N30')!;

			const sameWall = (one: number, two: number) =>
				(one === C.TERRAIN_MASK_WALL) === (two === C.TERRAIN_MASK_WALL);

			for (let ii = 1; ii < 49; ii++) {
				assert.ok(sameWall(center.terrain.get(ii, 0), top.terrain.get(ii, 49)),
					`Top edge mismatch at x=${ii}`);
				assert.ok(sameWall(center.terrain.get(49, ii), right.terrain.get(0, ii)),
					`Right edge mismatch at y=${ii}`);
				assert.ok(sameWall(center.terrain.get(ii, 49), bottom.terrain.get(ii, 0)),
					`Bottom edge mismatch at x=${ii}`);
				assert.ok(sameWall(center.terrain.get(0, ii), left.terrain.get(49, ii)),
					`Left edge mismatch at y=${ii}`);
			}
		});

		test('rejects user exits that conflict with existing neighbor', async () => {
			await generateRoom(shard, 'W40N40', {
				sources: 1, controller: true, mineral: false,
				exits: { top: [ 25 ], right: [ 25 ], bottom: [ 25 ], left: [ 10, 11, 12 ] },
			});

			await assert.rejects(
				() => generateRoom(shard, 'W41N40', {
					sources: 1, controller: true, mineral: false,
					exits: { right: [ 20, 21 ] },
				}),
				/don't match/,
			);
		});
	});

	describe('highway terrain', () => {
		// Highway rooms concentrate wall mass on the sector-facing borders and keep a passable central
		// lane studded with scattered wall-blob clutter: vertical lanes wall off left+right, horizontal
		// lanes top+bottom, crossings only the four corners. genHighwayTerrain is deterministic per room,
		// so averaging a fixed spread of world locations gives a stable profile.
		const emptyExits: ExitMap = { top: [], right: [], bottom: [], left: [] };

		function highwayProfile(orientation: HighwayOrientation) {
			const col = new Array<number>(50).fill(0);
			const row = new Array<number>(50).fill(0);
			let walls = 0;
			let rooms = 0;
			for (let rx = -25; rx <= 25; rx += 5) {
				for (let ry = -25; ry <= 25; ry += 5) {
					const grid = genHighwayTerrain(emptyExits, rx, ry, orientation, 0);
					for (let yy = 1; yy < 49; yy++) {
						for (let xx = 1; xx < 49; xx++) {
							if (grid[yy]![xx]!.wall) {
								walls++;
								col[xx]!++;
								row[yy]!++;
							}
						}
					}
					rooms++;
				}
			}
			const bandFraction = (counts: number[], lo: number, hi: number) => {
				let sum = 0;
				for (let ii = lo; ii <= hi; ii++) sum += counts[ii]!;
				return sum / ((hi - lo + 1) * rooms * 48);
			};
			return {
				density: walls / (rooms * 48 * 48),
				borderCols: (bandFraction(col, 1, 3) + bandFraction(col, 46, 48)) / 2,
				centerCols: bandFraction(col, 22, 27),
				borderRows: (bandFraction(row, 1, 3) + bandFraction(row, 46, 48)) / 2,
				centerRows: bandFraction(row, 22, 27),
			};
		}

		test('vertical lanes wall off left+right and keep the center open', () => {
			const prof = highwayProfile('vertical');
			assert.ok(prof.density > 0.15 && prof.density < 0.28, `density ${prof.density.toFixed(3)} in [0.15,0.28]`);
			assert.ok(prof.borderCols > 0.4, `left/right borders are wall mass (${prof.borderCols.toFixed(2)})`);
			assert.ok(prof.centerCols < 0.2, `central lane is open (${prof.centerCols.toFixed(2)})`);
			assert.ok(prof.borderCols > prof.centerCols * 2, 'borders far denser than the lane');
		});

		test('horizontal lanes wall off top+bottom and keep the center open', () => {
			const prof = highwayProfile('horizontal');
			assert.ok(prof.density > 0.15 && prof.density < 0.28, `density ${prof.density.toFixed(3)} in [0.15,0.28]`);
			assert.ok(prof.borderRows > 0.4, `top/bottom borders are wall mass (${prof.borderRows.toFixed(2)})`);
			assert.ok(prof.centerRows < 0.2, `central lane is open (${prof.centerRows.toFixed(2)})`);
			assert.ok(prof.borderRows > prof.centerRows * 2, 'borders far denser than the lane');
		});

		test('crossings keep the cross open with mass only in the corners', () => {
			const prof = highwayProfile('crossing');
			assert.ok(prof.density > 0.07 && prof.density < 0.22, `density ${prof.density.toFixed(3)} in [0.07,0.22]`);
			assert.ok(prof.centerCols < 0.2 && prof.centerRows < 0.2, 'both lane axes stay open');
			let corner = 0;
			let center = 0;
			for (let rx = -25; rx <= 25; rx += 5) {
				for (let ry = -25; ry <= 25; ry += 5) {
					const grid = genHighwayTerrain(emptyExits, rx, ry, 'crossing', 0);
					for (let ii = 2; ii < 10; ii++) {
						for (let jj = 2; jj < 10; jj++) {
							if (grid[jj]![ii]!.wall) corner++;
							if (grid[jj + 21]![ii + 21]!.wall) center++;
						}
					}
				}
			}
			assert.ok(corner > center * 2, `corners (${corner}) carry far more mass than the open center (${center})`);
		});

		test('exit throats stay passable through the border mass', () => {
			const exits: ExitMap = { top: [ 24, 25, 26 ], right: [], bottom: [ 24, 25, 26 ], left: [ 24, 25 ] };
			const grid = genHighwayTerrain(exits, 0, 5, 'vertical', 0);
			for (const xx of exits.top) assert.ok(!grid[0]![xx]!.wall && !grid[1]![xx]!.wall, `top exit ${xx} open`);
			for (const xx of exits.bottom) assert.ok(!grid[49]![xx]!.wall && !grid[48]![xx]!.wall, `bottom exit ${xx} open`);
			for (const yy of exits.left) assert.ok(!grid[yy]![0]!.wall && !grid[yy]![1]!.wall, `left exit ${yy} open`);
		});

		test('swamp: none at swampType 0, present for swampType > 0', () => {
			const swampTiles = (swampType: number) => {
				let count = 0;
				for (let ry = -10; ry <= 10; ry += 5) {
					const grid = genHighwayTerrain(emptyExits, 0, ry, 'vertical', swampType);
					for (let yy = 0; yy < 50; yy++) {
						for (let xx = 0; xx < 50; xx++) {
							if (grid[yy]![xx]!.swamp && !grid[yy]![xx]!.wall) count++;
						}
					}
				}
				return count;
			};
			assert.strictEqual(swampTiles(0), 0, 'swampType 0 produces no swamp');
			assert.ok(swampTiles(3) > 0, 'swampType 3 fills swamp into the lane');
		});
	});

	// Per-room quality, not just the spread mean. Highway terrain is deterministic per world location,
	// so a fixed spread of rooms is a stable sample of the whole distribution. Interior density clusters
	// ~18-23% (vertical/horizontal) / ~18% (crossing) with a bounded tail, and the central lane carries
	// scattered blob clutter but never floods. These assertions bound the per-room tail the mean hides.
	describe('highway per-room quality', () => {
		const emptyExits: ExitMap = { top: [], right: [], bottom: [], left: [] };
		const orientations = [ 'vertical', 'horizontal', 'crossing' ] as const;

		function *spread() {
			for (let rx = -33; rx <= 33; rx += 3) {
				for (let ry = -33; ry <= 33; ry += 3) {
					yield [ rx, ry ] as const;
				}
			}
		}

		function interiorDensity(grid: ReturnType<typeof genHighwayTerrain>): number {
			let walls = 0;
			for (let yy = 1; yy < 49; yy++) {
				for (let xx = 1; xx < 49; xx++) {
					if (grid[yy]![xx]!.wall) walls++;
				}
			}
			return walls / (48 * 48);
		}

		// Fraction open in the central lane core — the tiles far enough from the sector-facing border(s)
		// that they must stay traversable: the central columns for a vertical lane, central rows for a
		// horizontal one, the central block for a crossing (where both corridors cross).
		function laneOpenness(grid: ReturnType<typeof genHighwayTerrain>, orientation: typeof orientations[number]): number {
			let open = 0;
			let total = 0;
			for (let yy = 1; yy < 49; yy++) {
				for (let xx = 1; xx < 49; xx++) {
					const distLR = Math.min(xx, 49 - xx);
					const distTB = Math.min(yy, 49 - yy);
					const inLane = orientation === 'vertical' ? distLR >= 14
						: orientation === 'horizontal' ? distTB >= 14
						: distLR >= 14 && distTB >= 14;
					if (!inLane) continue;
					total++;
					if (!grid[yy]![xx]!.wall) open++;
				}
			}
			return open / total;
		}

		test('every highway room keeps its central lane passable', () => {
			for (const orientation of orientations) {
				let worst = 1;
				let worstAt = '';
				for (const [ rx, ry ] of spread()) {
					const open = laneOpenness(genHighwayTerrain(emptyExits, rx, ry, orientation, 0), orientation);
					if (open < worst) {
						worst = open;
						worstAt = `${rx},${ry}`;
					}
				}
				assert.ok(worst >= 0.6, `${orientation}: worst lane openness ${worst.toFixed(2)} at ${worstAt} must be >= 0.6 (lane never floods)`);
			}
		});

		test('highway density clusters in the vanilla band with a bounded tail', () => {
			const quantile = (sorted: number[], frac: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * frac))]!;
			for (const orientation of orientations) {
				const ds = [ ...spread() ]
					.map(([ rx, ry ]) => interiorDensity(genHighwayTerrain(emptyExits, rx, ry, orientation, 0)))
					.sort((lhs, rhs) => lhs - rhs);
				const median = quantile(ds, 0.5);
				const p90 = quantile(ds, 0.9);
				const max = ds[ds.length - 1]!;
				const medianBand = orientation === 'crossing' ? [ 0.13, 0.22 ] : [ 0.18, 0.27 ];
				const p90Cap = orientation === 'crossing' ? 0.26 : 0.36;
				// The live corpus tops out near 0.41 (vertical/horizontal) / 0.22 (crossing); this empty-exit
				// spread seals every border AND skips the exit recede that parts a real room's masses, so it
				// runs well above the carved corpus — more so now the lane masses carry the live corpus's full
				// depth (they were thinner before, which faked the density by sealing exits the live world
				// leaves open). The lane still stays passable and the cap holds the tail short of a clogged
				// room — the original failure mode reached 0.76. Crossing masses are unchanged, so its caps are.
				const maxCap = orientation === 'crossing' ? 0.35 : 0.57;
				assert.ok(median >= medianBand[0]! && median <= medianBand[1]!,
					`${orientation}: median density ${median.toFixed(3)} in [${medianBand[0]},${medianBand[1]}]`);
				assert.ok(p90 <= p90Cap, `${orientation}: p90 density ${p90.toFixed(3)} must be <= ${p90Cap}`);
				assert.ok(max <= maxCap, `${orientation}: max density ${max.toFixed(3)} must be <= ${maxCap}`);
			}
		});

		test('highway swamp stays in the vanilla range and is absent from about half of rooms', async () => {
			const count = 24;
			const names: string[] = [];
			for (let ii = 0; ii < count; ii++) {
				names.push(`W${60 + ii}N60`);
			}
			for (const name of names) {
				await generateRoom(shard, name, { corridor: true, controller: false, sources: 0, mineral: false });
			}
			const world = await shard.loadWorld();
			let swampFree = 0;
			let worst = 0;
			for (const name of names) {
				const terrain = world.terrain.get(name)!.terrain;
				let tiles = 0;
				for (let yy = 1; yy < 49; yy++) {
					for (let xx = 1; xx < 49; xx++) {
						if (terrain.get(xx, yy) === C.TERRAIN_MASK_SWAMP) tiles++;
					}
				}
				if (tiles === 0) swampFree++;
				worst = Math.max(worst, tiles);
			}
			assert.ok(worst <= 150, `highway swamp must not flood the lane (worst room had ${worst} tiles)`);
			assert.ok(swampFree >= count * 0.25 && swampFree <= count * 0.75,
				`about half of highways should be swamp-free (${swampFree}/${count})`);
		});
	});

	// Sector rejection tests cover the input-validation surface; full sector
	// generation (121 rooms) is verified manually because it blows past the
	// per-test timeout.
	describe('sector rejection', () => {
		test('generateSector rejects malformed sector name', async () => {
			await assert.rejects(() => generateSector(shard, 'foo'), /Invalid sector name/);
		});

		test('generateSector rejects origins not aligned to 10', async () => {
			await assert.rejects(() => generateSector(shard, 'W3N0'), /multiple of 10/);
			await assert.rejects(() => generateSector(shard, 'W0N5'), /multiple of 10/);
			await assert.rejects(() => generateSector(shard, 'E15N20'), /multiple of 10/);
		});

		test('generateSector rejects sectors past world bounds', async () => {
			await assert.rejects(() => generateSector(shard, 'W120N0'), /world bounds/);
			await assert.rejects(() => generateSector(shard, 'E0N120'), /world bounds/);
		});
	});
});
