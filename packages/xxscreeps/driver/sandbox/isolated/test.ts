import * as assert from 'node:assert/strict';
import { describe, test } from 'xxscreeps/test/index.js';
import { classifyIvmRunError } from './index.js';

describe('classifyIvmRunError', () => {
	test('script timeout', () => {
		assert.deepEqual(
			classifyIvmRunError({ message: 'Script execution timed out.', stack: 'stack' }),
			{ result: 'timedOut', stack: 'stack' });
	});

	test('isolate disposed before call', () => {
		assert.deepEqual(
			classifyIvmRunError({ message: 'Isolate is disposed' }),
			{ result: 'disposed' });
	});

	test('isolate already disposed', () => {
		assert.deepEqual(
			classifyIvmRunError({ message: 'Isolate is already disposed' }),
			{ result: 'disposed' });
	});

	test('isolate disposed during execution', () => {
		assert.deepEqual(
			classifyIvmRunError({ message: 'Isolate was disposed during execution' }),
			{ result: 'disposed' });
	});

	test('isolate disposed during execution due to memory limit', () => {
		assert.deepEqual(
			classifyIvmRunError({ message: 'Isolate was disposed during execution due to memory limit' }),
			{ result: 'disposed' });
	});

	test('unrelated error passes through', () => {
		assert.equal(classifyIvmRunError({ message: 'TypeError: x is not a function' }), null);
	});
});
