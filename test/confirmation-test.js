"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const core_1 = require("../src/core");
const chai_1 = require("chai");
describe('confirmation-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    it('by default no confirmation is required', async function () {
        test_utils_1.configure();
        test_utils_1.createMigration('a');
        await core_1.runMigrations();
        test_utils_1.assertMigrations(['a']);
    });
    describe('run-time confirmation', function () {
        before(test_utils_1.configure);
        it('is done before running migrations', async function () {
            test_utils_1.createMigration('a');
            let confirmed;
            await core_1.runMigrations({
                confirmation: () => {
                    test_utils_1.assertMigrations([]);
                    confirmed = true;
                    return true;
                }
            });
            test_utils_1.assertMigrations(['a']);
            chai_1.assert.ok(confirmed);
        });
        it('can prevent migrations', async function () {
            test_utils_1.createMigration('a');
            await core_1.runMigrations({ confirmation: () => false });
            test_utils_1.assertMigrations([]);
        });
        it('can throw to cause the migration running to throw', async function () {
            test_utils_1.createMigration('a');
            await test_utils_1.expectFailure(core_1.runMigrations({
                confirmation: () => {
                    throw new Error('stop');
                }
            }));
        });
        it('can allow migrations to be run', async function () {
            test_utils_1.createMigration('a');
            await core_1.runMigrations({ confirmation: () => true });
            test_utils_1.assertMigrations(['a']);
        });
        it('is not called if no migrations are about to be run', async function () {
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            let confirmed = false;
            await core_1.runMigrations({ confirmation: () => confirmed = true });
            chai_1.assert.ok(!confirmed);
        });
        it('can be asynchronous', async function () {
            test_utils_1.createMigration('a');
            await core_1.runMigrations({ confirmation: async () => false });
            test_utils_1.assertMigrations([]);
            await core_1.runMigrations({ confirmation: async () => true });
            test_utils_1.assertMigrations(['a']);
        });
        it('can access migrations', async function () {
            test_utils_1.createMigration('a');
            await core_1.runMigrations({ confirmation: migrations => {
                    chai_1.assert.equal(migrations[0].friendlyName, 'a');
                    return true;
                } });
        });
    });
    describe('config confirmation', function () {
        it('is done before running migrations', async function () {
            let confirmed;
            test_utils_1.configure({
                confirmation: () => {
                    test_utils_1.assertMigrations([]);
                    confirmed = true;
                    return true;
                }
            });
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            test_utils_1.assertMigrations(['a']);
            chai_1.assert.ok(confirmed);
        });
        it('can prevent migrations', async function () {
            test_utils_1.configure({ confirmation: () => false });
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            test_utils_1.assertMigrations([]);
        });
        it('can throw to cause the migration running to throw', async function () {
            test_utils_1.createMigration('a');
            await test_utils_1.expectFailure(core_1.runMigrations({
                confirmation: () => {
                    throw new Error('stop');
                }
            }));
        });
        it('can allow migrations to be run', async function () {
            test_utils_1.configure({ confirmation: () => true });
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            test_utils_1.assertMigrations(['a']);
        });
        it('is not called if no migrations are about to be run', async function () {
            let confirmed;
            test_utils_1.configure({ confirmation: () => confirmed = true });
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            confirmed = false;
            await core_1.runMigrations();
            chai_1.assert.ok(!confirmed);
        });
        it('can be asynchronous', async function () {
            let confValue = false;
            test_utils_1.configure({ confirmation: async () => confValue });
            test_utils_1.createMigration('a');
            await core_1.runMigrations();
            test_utils_1.assertMigrations([]);
            confValue = true;
            await core_1.runMigrations();
            test_utils_1.assertMigrations(['a']);
        });
        it('can access migrations', async function () {
            test_utils_1.createMigration('a');
            test_utils_1.configure({ confirmation: (migrations) => {
                    chai_1.assert.equal(migrations[0].friendlyName, 'a');
                    return true;
                } });
            await core_1.runMigrations();
        });
    });
    describe('combination confirmation', function () {
        describe('either confirmation can block migrations', function () {
            let toPass;
            const runtimeConfirm = confirmer('runtime');
            before(function () {
                test_utils_1.configure(confirmer('conf'));
            });
            function confirmer(key) {
                return { confirmation: () => toPass[key] };
            }
            beforeEach(function () {
                test_utils_1.createMigration('a');
            });
            it('both', async function () {
                toPass = { conf: false, runtime: false };
                await core_1.runMigrations(runtimeConfirm);
                test_utils_1.assertMigrations([]);
            });
            it('runtime', async function () {
                toPass = { conf: true, runtime: false };
                await core_1.runMigrations(runtimeConfirm);
                test_utils_1.assertMigrations([]);
            });
            it('config', async function () {
                toPass = { conf: false, runtime: true };
                await core_1.runMigrations(runtimeConfirm);
                test_utils_1.assertMigrations([]);
            });
            it('neither', async function () {
                toPass = { conf: true, runtime: true };
                await core_1.runMigrations(runtimeConfirm);
                test_utils_1.assertMigrations(['a']);
            });
        });
        it('config migration is not called if runtime migration blocks', async function () {
            test_utils_1.configure({
                confirmation: () => {
                    throw new Error('Should not end up here');
                }
            });
            test_utils_1.createMigration('a');
            await core_1.runMigrations({ confirmation: () => false });
        });
        describe('throwing causes migration running to throw', function () {
            before(function () {
                test_utils_1.configure({
                    confirmation: () => {
                        throw new Error('Config');
                    }
                });
            });
            it('runtime', async function () {
                test_utils_1.createMigration('a');
                await test_utils_1.expectFailure(core_1.runMigrations({
                    confirmation: () => {
                        throw new Error('Runtime');
                    }
                }), err => chai_1.assert.equal(err.message, 'Runtime'));
            });
            it('config', async function () {
                test_utils_1.createMigration('a');
                await test_utils_1.expectFailure(core_1.runMigrations({ confirmation: () => true }), err => chai_1.assert.equal(err.message, 'Config'));
            });
        });
        it('config confirmation is given the return value from run-time confirmation', async function () {
            const value = 'test value';
            test_utils_1.createMigration('a');
            let confirmed = false;
            test_utils_1.configure({
                confirmation: (migrations, msg) => {
                    chai_1.assert.equal(msg, value);
                    confirmed = true;
                }
            });
            await core_1.runMigrations({ confirmation: () => value });
            chai_1.assert.ok(confirmed);
        });
    });
});
