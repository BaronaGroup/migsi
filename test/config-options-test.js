"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const core = require("../src/core");
const fs = require("fs");
const chai_1 = require("chai");
const path = require("path");
describe('config-options-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    it('migrationDir', async function () {
        const migrationFilename = __dirname + '/../test-workspace/alpha/beta.migsi.js';
        chai_1.assert.ok(!fs.existsSync(migrationFilename));
        const migrationDir = __dirname + '/../test-workspace/alpha';
        fs.mkdirSync(migrationDir);
        test_utils_1.configure({ migrationDir });
        await core.createMigrationScript('beta');
        chai_1.assert.ok(fs.existsSync(migrationFilename));
        await test_utils_1.expectFailure(test_utils_1.runMigrations(), err => chai_1.assert.equal(err.message, 'Not implemented'));
    });
    describe('templateDir', function () {
        const cases = [
            { label: 'new templates', templateName: 'new-template' },
            { label: 'overriding default templates', templateName: 'default' }
        ];
        for (let { label, templateName } of cases) {
            it(label, async function () {
                const templateDir = path.join(__dirname, '..', 'test-workspace'); // we might as well use the workspace directly
                test_utils_1.configure({ templateDir });
                const templateData = `
        module.exports = { run()  { require('../test/test-utils').runImpl('template-${templateName}')} } `;
                fs.writeFileSync(path.join(templateDir, templateName + '.js'), templateData, 'UTF-8');
                await core.createMigrationScript('migration', templateName);
                await test_utils_1.runMigrations();
                await test_utils_1.assertMigrations([`template-${templateName}`]);
            });
        }
    });
    describe('failOnDevelopmentScriptsInProductionMode ', function () {
        beforeEach(async function () {
            test_utils_1.createMigration('a', { inDevelopment: false });
            test_utils_1.createMigration('b', { inDevelopment: true, dependencies: ['a'] });
        });
        it('unset', async function () {
            test_utils_1.configure();
            await test_utils_1.runMigrations(true);
            test_utils_1.assertMigrations(['a']);
        });
        it('set to true', async function () {
            test_utils_1.configure({ failOnDevelopmentScriptsInProductionMode: true });
            await test_utils_1.expectFailure(test_utils_1.runMigrations(true));
        });
    });
    describe('storage', function () {
        it('uses provided storage', async function () {
            const stored = [];
            test_utils_1.configure({
                storage: {
                    async loadPastMigrations() {
                        return [
                            {
                                migsiName: 'a',
                                hasBeenRun: true
                            }
                        ];
                    },
                    async updateStatus(migration) {
                        stored.push(migration.migsiName);
                    }
                }
            });
            test_utils_1.createMigration('a');
            test_utils_1.createMigration('b');
            await test_utils_1.runMigrations();
            test_utils_1.assertMigrations(['b']);
            chai_1.assert.deepEqual(stored, ['b']);
        });
    });
    describe('allowRerunningAllMigrations ', function () {
        async function body() {
            const script = test_utils_1.createMigration('a', { version: 'hash', 'token': 'TOKEN' });
            await test_utils_1.runMigrations();
            test_utils_1.replaceInFile(script, /TOKEN/, 'TOKEN2');
            test_utils_1.wipeTestModuleCache();
            await test_utils_1.runMigrations();
        }
        it('set to false', async function () {
            test_utils_1.configure({ allowRerunningAllMigrations: false });
            await body();
            test_utils_1.assertMigrations(['a']);
        });
        it('set to true', async function () {
            test_utils_1.configure({ allowRerunningAllMigrations: true });
            await body();
            test_utils_1.assertMigrations(['a', 'a']);
        });
    });
    describe('prefixAlgorithm ', function () {
        it('simple prefix', async function () {
            test_utils_1.configure({ prefixAlgorithm: () => 'howdy' });
            await core.createMigrationScript('test');
            chai_1.assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/howdytest.migsi.js')));
        });
        it('with a path', async function () {
            test_utils_1.configure({ prefixAlgorithm: () => 'dir/name/' });
            await core.createMigrationScript('test');
            chai_1.assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/dir/name/test.migsi.js')));
        });
    });
    describe('confirmation', function () {
        // The tests are implemented in confirmation-test.js
    });
});
