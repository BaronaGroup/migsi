"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const chai_1 = require("chai");
const config_1 = require("../src/config");
describe('output-tracking-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    describe('disabled', function () {
        before(() => test_utils_1.configure({ disableOutputTracking: true }));
        it('is possible to disable output tracking', async function () {
            test_utils_1.createMigration('a', { run: () => console.log('sample output') });
            await test_utils_1.runMigrations();
            const migration = await getMigration('a');
            if (!migration.output)
                throw new Error('Output not found');
            chai_1.assert.isUndefined(migration.output.run);
            chai_1.assert.isUndefined(migration.output.rollback);
        });
    });
    describe('enabled', function () {
        before(() => test_utils_1.configure());
        it('tracks console.log', async function () {
            test_utils_1.createMigration('a', { run: () => console.log('sample output') });
            await test_utils_1.runMigrations();
            const migration = await getMigration('a');
            chai_1.assert.equal(migration.output.run.stdout[0].data, 'sample output\n');
        });
        it('tracks process.stdout.write', async function () {
            test_utils_1.createMigration('a', { run: () => process.stdout.write('another test\n') });
            await test_utils_1.runMigrations();
            const migration = await getMigration('a');
            chai_1.assert.equal(migration.output.run.stdout[0].data, 'another test\n');
        });
        it('can be piped output of external processes', async function () {
            test_utils_1.createMigration('a', {
                run: () => {
                    return new Promise(resolve => {
                        const cp = require('child_process');
                        const child = cp.spawn('bash', ['-c', 'cat ../package.json | grep name | head -n1'], { cwd: __dirname, stdio: 'pipe' });
                        child.stdout.pipe(process.stdout);
                        child.stderr.pipe(process.stderr);
                        child.on('close', resolve);
                    });
                }
            });
            await test_utils_1.runMigrations();
            const migration = await getMigration('a');
            chai_1.assert.equal(migration.output.run.stdout[0].data.trim(), '"name": "migsi",');
        });
        it('tracks both stdout and stderr', async function () {
            test_utils_1.createMigration('a', { run: () => {
                    console.log('output');
                    console.error('error');
                } });
            await test_utils_1.runMigrations();
            const migration = await getMigration('a');
            chai_1.assert.equal(migration.output.run.stdout[0].data, 'output\n');
            chai_1.assert.equal(migration.output.run.stderr[0].data, 'error\n');
        });
        it('tracks rollback output', async function () {
            test_utils_1.createMigration('a', {
                run: () => { throw new Error('stop'); },
                rollback: () => console.log('rolling back')
            });
            await test_utils_1.expectFailure(test_utils_1.runMigrations());
            const migration = await getMigration('a');
            chai_1.assert.equal(migration.output.rollback.stdout[0].data, 'rolling back\n');
        });
    });
});
async function getMigration(name) {
    if (!config_1.config.storage)
        throw new Error('Storage not found');
    const pastMigrations = await config_1.config.storage.loadPastMigrations();
    const found = pastMigrations.find(m => m.migsiName === name);
    if (!found)
        throw new Error('Did not find migration');
    return found;
}
