import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { optionalExpiryTime, registerEffectsProvider } from 'xxscreeps/game/object.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureInvaderCore } from './invader-core.js';
import { invaderCoreShape } from './schema.js';

export type StrongholdRoomSchema = typeof invaderCoreSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invaderCoreSchema = registerVariant('Room.objects', compose(invaderCoreShape, StructureInvaderCore));

// Deployed stronghold peers surface their shared collapse timer. This mod registers
// `#collapseTime` on every structure, so it also owns the derived view.
registerEffectsProvider(Structure, structure => {
	const ticksRemaining = optionalExpiryTime(structure['#collapseTime']);
	return ticksRemaining === undefined ? undefined : [ { effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining } ];
});
