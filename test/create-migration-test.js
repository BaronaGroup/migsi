"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const core = require("../src/core");
const fs = require("fs");
const chai_1 = require("chai");
const path = require("path");
describe('create-migration-test.js', function () {
    before(function () {
        test_utils_1.configure();
    });
    beforeEach(function () {
        test_utils_1.wipeWorkspace();
    });
    it('is able to create migrations', async function () {
        await core.createMigrationScript('eins');
        const migrations = await core.loadAllMigrations();
        chai_1.assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/eins.migsi.js')));
        chai_1.assert.equal(migrations[0].friendlyName, 'eins');
    });
    describe('it is possible to use', function () {
        it('default templates', async function () {
            await core.createMigrationScript('drei', 'default');
            await test_utils_1.expectFailure(test_utils_1.runMigrations(), err => chai_1.assert.equal(err.message, 'Not implemented'));
        });
        it('custom templates', async function () {
            const templateDir = path.join(__dirname, '../test-workspace');
            test_utils_1.configure({ templateDir });
            const templateData = `module.exports = { run() { throw new Error('custom')}}`;
            fs.writeFileSync(templateDir + '/custom.js', templateData, 'UTF-8');
            await core.createMigrationScript('drei', 'custom');
            await test_utils_1.expectFailure(test_utils_1.runMigrations(), err => chai_1.assert.equal(err.message, 'custom'));
        });
        it('custom templates with .template.js', async function () {
            const templateDir = path.join(__dirname, '../test-workspace');
            test_utils_1.configure({ templateDir });
            const templateData = `module.exports = { run() { throw new Error('custom')}}`;
            fs.writeFileSync(templateDir + '/custom.template.js', templateData, 'UTF-8');
            await core.createMigrationScript('drei', 'custom');
            await test_utils_1.expectFailure(test_utils_1.runMigrations(), err => chai_1.assert.equal(err.message, 'custom'));
        });
    });
    it('friendly name is set up properly within the migration (assuming template support)', async function () {
        await core.createMigrationScript('zwei');
        const migrations = await core.loadAllMigrations();
        chai_1.assert.equal(migrations[0].friendlyName, 'zwei');
    });
    it('default dependency is set up properly within the migration (assuming template support)', async function () {
        await core.createMigrationScript('ichi');
        await core.createMigrationScript('ni');
        await core.createMigrationScript('san');
        const migrations = await core.loadAllMigrations();
        chai_1.assert.deepEqual(migrations[0].dependencies, []);
        chai_1.assert.deepEqual(migrations[1].dependencies, ['ichi']);
        chai_1.assert.deepEqual(migrations[2].dependencies, ['ni']);
    });
});
