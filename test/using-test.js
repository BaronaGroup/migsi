"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const chai_1 = require("chai");
let sequence = [];
exports.addToSequence = (...args) => {
    sequence.push(args.join(' '));
};
exports.using = function (id) {
    return {
        async open() {
            sequence.push('+' + id);
            return id;
        },
        async close() {
            sequence.push('-' + id);
        }
    };
};
describe('using-test', function () {
    beforeEach(function () {
        test_utils_1.wipeWorkspace();
        sequence = [];
    });
    describe('various forms of declaring using modules', function () {
        it('in configuration', async function () {
            test_utils_1.configure({ using: { '1': exports.using('1') } });
            createUsingMigration('m1', {
                using: ['1']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+1',
                'm1 1',
                '-1'
            ]);
        });
        it('inline', async function () {
            test_utils_1.configure();
            const filename = createUsingMigration('m1', {
                using: ['TOKEN']
            });
            await test_utils_1.replaceInFile(filename, '"TOKEN"', `require('../test/using-test').using('99')`);
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+99',
                'm1 99',
                '-99'
            ]);
        });
        it('with setup', async function () {
            test_utils_1.configure({ using: { 'x': {
                        setup() {
                            return {
                                open() {
                                    exports.addToSequence('+x');
                                    return 'x';
                                },
                                close() {
                                    exports.addToSequence('-x');
                                }
                            };
                        }
                    } } });
            createUsingMigration('m1', {
                using: ['x']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+x',
                'm1 x',
                '-x'
            ]);
        });
        it('simple', async function () {
            test_utils_1.configure({ using: { 'q': () => 'q' } });
            createUsingMigration('m1', {
                using: ['q']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                'm1 q'
            ]);
        });
    });
    describe('utilizing using', function () {
        before(function () {
            test_utils_1.configure({
                using: {
                    'a': exports.using('a'),
                    'b': exports.using('b'),
                    'c': exports.using('c')
                }
            });
        });
        it('initializes the using for the migration and closes after', async function () {
            createUsingMigration('m1', {
                using: ['a']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+a',
                'm1 a',
                '-a'
            ]);
        });
        it('shares the object between multiple migrations that need it', async function () {
            createUsingMigration('m1', {
                using: ['a']
            });
            createUsingMigration('m2', {
                using: ['a'],
                dependencies: ['m1']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+a',
                'm1 a',
                'm2 a',
                '-a'
            ]);
        });
        it('unloads the object once no migration needs it', async function () {
            createUsingMigration('m1', {
                using: ['a']
            });
            createUsingMigration('m2', {
                using: ['a'],
                dependencies: ['m1']
            });
            createUsingMigration('m3', {
                dependencies: ['m2']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+a',
                'm1 a',
                'm2 a',
                '-a',
                'm3'
            ]);
        });
        it('multiple usings are supported', async function () {
            createUsingMigration('m1', {
                using: ['a', 'b']
            });
            await test_utils_1.runMigrations();
            chai_1.assert.deepEqual(sequence, [
                '+a',
                '+b',
                'm1 a b',
                '-a',
                '-b'
            ]);
        });
    });
});
function createUsingMigration(name, args) {
    const withWrapper = Object.assign({}, args, { run: `async function(...args) {
      const { addToSequence } = require('../test/using-test')
      addToSequence(this.friendlyName, ...args)
    }` });
    return test_utils_1.createMigration(name, withWrapper);
}
