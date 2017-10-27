"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
describe('dependencies-test', function () {
    before(function () {
        test_utils_1.configure();
    });
    beforeEach(function () {
        test_utils_1.wipeWorkspace();
    });
    it('migrations can have multiple dependencies', async function () {
        test_utils_1.createMigration('a');
        test_utils_1.createMigration('b', { dependencies: ['a', 'd'] });
        test_utils_1.createMigration('c', { dependencies: ['a'] });
        test_utils_1.createMigration('d');
        await test_utils_1.runMigrations();
        test_utils_1.assertMigrations(['a', 'c', 'd', 'b']);
    });
    it('with migrations dependant on the sames dependencies, production migrations are preferred', async function () {
        test_utils_1.createMigration('a');
        test_utils_1.createMigration('b', { inDevelopment: true, dependencies: ['a'] });
        test_utils_1.createMigration('c', { inDevelopment: false, dependencies: ['a'] });
        await test_utils_1.runMigrations();
        test_utils_1.assertMigrations(['a', 'c', 'b']);
    });
    it('missing dependencies are a major error', async function () {
        test_utils_1.createMigration('a', { dependencies: ['-1'] });
        await test_utils_1.expectFailure(test_utils_1.runMigrations());
    });
    it('dependency loops are a major error', async function () {
        test_utils_1.createMigration('a', { dependencies: ['b'] });
        test_utils_1.createMigration('b', { dependencies: ['a'] });
        await test_utils_1.expectFailure(test_utils_1.runMigrations());
    });
});
