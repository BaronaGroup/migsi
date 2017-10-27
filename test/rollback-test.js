"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
describe('rollback-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    describe('full rollback mode', function () {
        before(() => test_utils_1.configure({ rollbackAll: true }));
        it('a failed migration can be rolled back', async function () {
            test_utils_1.createMigration('a', {
                rollback: true, run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['rollback:a']);
        });
        it('if all migrations support rollback, they are all rolled back on a failure', async function () {
            test_utils_1.createMigration('a', { rollback: true });
            test_utils_1.createMigration('b', { rollback: true, dependencies: ['a'] });
            test_utils_1.createMigration('c', {
                dependencies: ['b'],
                rollback: true,
                run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['a', 'b', 'rollback:c', 'rollback:b', 'rollback:a']);
        });
        it('if only some of the migrations support rollback, migrations up to that point are rolled back', async function () {
            test_utils_1.createMigration('a');
            test_utils_1.createMigration('b', { rollback: true, dependencies: ['a'] });
            test_utils_1.createMigration('c', {
                dependencies: ['b'],
                rollback: true,
                run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['a', 'b', 'rollback:c', 'rollback:b']);
        });
        it('migrations from previous runs are not rolled back', async function () {
            test_utils_1.createMigration('a', { rollback: true });
            await test_utils_1.runMigrations();
            test_utils_1.createMigration('b', { rollback: true, dependencies: ['a'] });
            test_utils_1.createMigration('c', {
                dependencies: ['b'],
                rollback: true,
                run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['a', 'b', 'rollback:c', 'rollback:b']);
        });
        it('rolled back migrations are attempted again on the next run', async function () {
            test_utils_1.createMigration('a');
            test_utils_1.createMigration('b', { rollback: true, dependencies: ['a'] });
            test_utils_1.createMigration('c', {
                dependencies: ['b'],
                rollback: true,
                run: function () {
                    if (eval('global.fail'))
                        throw new Error('failure');
                    return this.__run();
                }
            });
            const g = global;
            g.fail = true;
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            g.fail = false;
            await test_utils_1.runMigrations();
            test_utils_1.assertMigrations(['a', 'b', 'rollback:c', 'rollback:b', 'b', 'c']);
        });
    });
    describe('single rollback mode', function () {
        before(() => test_utils_1.configure({ rollbackAll: false }));
        it('a failed migration can be rolled back', async function () {
            test_utils_1.createMigration('a', {
                rollback: true, run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['rollback:a']);
        });
        it('lacking rollback option is fine', async function () {
            test_utils_1.createMigration('a', {
                run: () => {
                    throw new Error('failure');
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations([]);
        });
        it('rolled back migrations are attempted again on the next run', async function () {
            const g = global;
            g.fail = true;
            test_utils_1.createMigration('a', {
                rollback: true, run: function () {
                    if (eval('global.fail'))
                        throw new Error('failure');
                    return this.__run();
                }
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            g.fail = false;
            await test_utils_1.runMigrations();
            test_utils_1.assertMigrations(['rollback:a', 'rollback:a', 'a']);
        });
        it('only the failed migration is rolled back', async function () {
            test_utils_1.createMigration('a', { rollback: true });
            test_utils_1.createMigration('b', {
                rollback: true, run: () => {
                    throw new Error('failure');
                },
                dependencies: ['a']
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            test_utils_1.assertMigrations(['a', 'rollback:b']);
        });
    });
});
