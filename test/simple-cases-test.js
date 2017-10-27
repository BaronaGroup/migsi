"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
describe('simple-cases', function () {
    before(test_utils_1.configure);
    beforeEach(test_utils_1.wipeWorkspace);
    it('a single migration', async function () {
        await test_utils_1.createMigration('a');
        await test_utils_1.runMigrations();
        await test_utils_1.assertMigrations(['a']);
    });
    it('a bunch of migrations with trivial dependencies', async function () {
        await test_utils_1.createMigration('a', { dependencies: ['b'] });
        await test_utils_1.createMigration('b');
        await test_utils_1.createMigration('c', { dependencies: ['a'] });
        await test_utils_1.runMigrations();
        await test_utils_1.assertMigrations(['b', 'a', 'c']);
    });
});
