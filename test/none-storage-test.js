"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const none_1 = require("../src/storage/none");
const chai_1 = require("chai");
const _ = require("lodash");
describe('none-storage-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    before(() => test_utils_1.configure({ storage: none_1.default }));
    it('assumes no migrations have been run', async function () {
        test_utils_1.createMigration('a');
        const migrations = await test_utils_1.runMigrations(false, { dryRun: true });
        chai_1.assert.deepEqual(_.map(migrations, 'friendlyName'), ['a']);
    });
    it('will not allow running new migrations', async function () {
        test_utils_1.createMigration('a');
        await test_utils_1.expectFailure(test_utils_1.runMigrations(false), e => chai_1.assert.equal(e.message, 'Storage "none" does not support running migrations.'));
    });
});
