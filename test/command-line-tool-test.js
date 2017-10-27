"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const path = require("path");
const fs = require("fs");
const chai_1 = require("chai");
const cp = require("child_process");
const config_1 = require("../src/config");
const moment = require("moment");
const _ = require("lodash");
require("mocha");
describe('command-line-tool-test', function () {
    const workspace = path.join(__dirname, '..', 'test-workspace'), configFile = path.join(workspace, 'config.js'), storageFile = path.join(workspace, 'storage.json');
    beforeEach(function () {
        test_utils_1.wipeWorkspace();
        fs.writeFileSync(configFile, `
      module.exports = {
        migrationDir: '${workspace}',
        templateDir: '${workspace}',
        storage: require('${path.join(__dirname, '..', 'storage', 'json-file')}')('${storageFile}'),
        prefixAlgorithm: () => ''
      }
   `, 'UTF-8');
        config_1.loadConfig(configFile);
    });
    describe('create', function () {
        it('with name on command line', async function () {
            await run(`node bin/migsi create --config=${configFile} --name=another`);
            const script = path.join(workspace, 'another.migsi.js');
            chai_1.assert.ok(fs.existsSync(script));
            const loaded = require(script);
            chai_1.assert.equal(loaded.friendlyName, 'another');
            await test_utils_1.expectFailure(test_utils_1.runMigrations(), (e) => chai_1.assert.equal(e.message, 'Not implemented'));
        });
        it('with another template', async function () {
            fs.writeFileSync(path.join(workspace, 'custom.js'), `
      module.exports = { run() { throw new Error('Is custom') }}
      `, 'UTF-8');
            await run(`node bin/migsi create --config=${configFile} --name=third --template=custom`);
            const script = path.join(workspace, 'third.migsi.js');
            chai_1.assert.ok(fs.existsSync(script));
            await test_utils_1.expectFailure(test_utils_1.runMigrations(), (e) => chai_1.assert.equal(e.message, 'Is custom'));
        });
    });
    describe('run', function () {
        describe('confirmation', function () {
            // since there often is no TTY for the tests, the confirmation tests are omitted for the time being
        });
        beforeEach(function () {
            test_utils_1.createMigration('a', { inDevelopment: false });
            test_utils_1.createMigration('b', { inDevelopment: true, dependencies: ['a'] });
        });
        it('is able to run all scripts', async function () {
            await run(`node bin/migsi run --config=${configFile} --yes`);
            test_utils_1.assertMigrations(['a', 'b']);
        });
        it('is able to run production scripts', async function () {
            await run(`node bin/migsi run --config=${configFile} --production --yes`);
            test_utils_1.assertMigrations(['a']);
        });
        it('supports dry-run', async function () {
            await run(`node bin/migsi run --config=${configFile} --production --yes --dry-run`);
            test_utils_1.assertMigrations([]);
        });
    });
    describe('list', function () {
        it('lists migrations in order along with their run dates, when relevant', async function () {
            test_utils_1.createMigration('script1');
            test_utils_1.createMigration('script2', { dependencies: ['script1'] });
            await test_utils_1.runMigrations();
            test_utils_1.createMigration('newscript');
            const { stdout } = await run(`MIGSI_QUIET= node bin/migsi list --config=${configFile}`);
            const lines = stdout.split('\n');
            const hasDate = /20\d\d/;
            chai_1.assert.ok(lines[0].includes('script1'));
            chai_1.assert.ok(hasDate.test(lines[0]));
            chai_1.assert.ok(lines[1].includes('script2'));
            chai_1.assert.ok(hasDate.test(lines[1]));
            chai_1.assert.ok(lines[2].includes('newscript'));
            chai_1.assert.ok(lines[2].includes('to-be-run'));
        });
    });
    describe('ensure-no-development-scripts', function () {
        it('passes if there are no development scripts', async function () {
            test_utils_1.createMigration('a', { inDevelopment: false });
            await run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`);
        });
        it('fails if there are development scripts', async function () {
            test_utils_1.createMigration('a', { inDevelopment: true });
            await test_utils_1.expectFailure(run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`));
        });
    });
    describe('output', function () {
        describe('data', function () {
            it('is able to display stdout', async function () {
                test_utils_1.createMigration('s1', { run: () => console.log('hello from within') });
                await test_utils_1.runMigrations();
                const { stdout } = await run(`node bin/migsi output --config=${configFile}`);
                chai_1.assert.ok(stdout.split('\n').some(line => line.includes('stdout') && line.includes('hello from within')));
            });
            it('is able to display stderr', async function () {
                test_utils_1.createMigration('s1', { run: () => console.error('error from within') });
                await test_utils_1.runMigrations();
                const { stdout } = await run(`node bin/migsi output --config=${configFile}`);
                chai_1.assert.ok(stdout.split('\n').some(line => line.includes('stderr') && line.includes('error from within')));
            });
            it('is able to display exceptions', async function () {
                test_utils_1.createMigration('s1', {
                    run: () => {
                        throw new Error('This migration failed');
                    }
                });
                await test_utils_1.expectFailure(test_utils_1.runMigrations());
                const { stdout } = await run(`node bin/migsi output --config=${configFile}`);
                chai_1.assert.ok(stdout.split('\n').some(line => line.includes('This migration failed')));
            });
            it('raw', async function () {
                test_utils_1.createMigration('s1', { run: () => console.log('hello from within') });
                await test_utils_1.runMigrations();
                const { stdout } = await run(`node bin/migsi output --config=${configFile} --raw`);
                chai_1.assert.ok(stdout.split('\n').includes('hello from within'));
            });
        });
        describe('filtering', function () {
            it('by name', async function () {
                test_utils_1.createMigration('s1', { run: () => console.log('s1 says hi') });
                test_utils_1.createMigration('s2', { run: () => console.log('s2 says hi') });
                await test_utils_1.runMigrations();
                const { stdout } = await run(`node bin/migsi output --config=${configFile} --name=s1`);
                const lines = stdout.split('\n');
                chai_1.assert.ok(lines.some(line => line.includes('stdout') && line.includes('s1 says hi')));
                chai_1.assert.ok(!lines.some(line => line.includes('stdout') && line.includes('s2 says hi')));
            });
            it('failed', async function () {
                test_utils_1.createMigration('s1', { run: () => console.log('s1 says hi') });
                test_utils_1.createMigration('s2', {
                    run: () => {
                        throw new Error('s2 says fail');
                    }, dependencies: ['s1']
                });
                await test_utils_1.expectFailure(test_utils_1.runMigrations());
                const { stdout } = await run(`node bin/migsi output --config=${configFile} --failed`);
                const lines = stdout.split('\n');
                chai_1.assert.ok(!lines.some(line => line.includes('s1 says hi')));
                chai_1.assert.ok(lines.some(line => line.includes('s2 says fail')));
            });
            describe('durations', function () {
                beforeEach(async function () {
                    for (let i = 1; i < 16; i += 2) {
                        const desiredRunDate = moment().subtract(Math.pow(2, i), 'hours').toDate();
                        test_utils_1.createMigration('m' + i, {
                            desiredRunDate, i, run: function () {
                                console.log('I am', this.i);
                            }
                        });
                    }
                    test_utils_1.createMigration('mnow', {
                        run: function () {
                            console.log('I am now');
                        }
                    });
                    await test_utils_1.runMigrations();
                    if (!config_1.config.storage)
                        throw new Error('Missing storage');
                    for (let past of await config_1.config.storage.loadPastMigrations()) {
                        if (past.desiredRunDate) {
                            past.runDate = past.desiredRunDate;
                            await config_1.config.storage.updateStatus(past);
                        }
                    }
                });
                // TODO: some of these tests can fail if the beforeeach is run before a full hour and the it after;
                // figure out a solution for that
                describe('since', function () {
                    it('specific date', async function () {
                        const oneWeekAgo = moment().subtract(1, 'week').toDate().toISOString();
                        const { stdout } = await run(`node bin/migsi output --config=${configFile} --since=${oneWeekAgo}`);
                        assertRan(stdout, 'now', 1, 3, 5, 7);
                    });
                    it('date with a local timestamp is accepted', async function () {
                        const now = new Date();
                        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().split('T')[0];
                        const { stdout } = await run(`node bin/migsi output --config=${configFile} --since=${today}`);
                        const expected = _.compact([
                            'now',
                            new Date().getHours() >= 2 && 1,
                            new Date().getHours() >= 8 && 3
                        ]);
                        assertRan(stdout, ...expected);
                    });
                });
                describe('until', function () {
                    it('specific date', async function () {
                        const oneWeekAgo = moment().subtract(1, 'week').toDate().toISOString();
                        const { stdout } = await run(`node bin/migsi output --config=${configFile} --until=${oneWeekAgo}`);
                        assertRan(stdout, 9, 11, 13, 15);
                    });
                    it('date with a local timestamp is accepted', async function () {
                        const now = new Date();
                        const yesterday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1)).toISOString().split('T')[0];
                        const { stdout } = await run(`node bin/migsi output --config=${configFile} --until=${yesterday}`);
                        const expected = _.compact([
                            new Date().getHours() < 2 && 1,
                            new Date().getHours() < 8 && 3,
                            5,
                            7,
                            9,
                            11,
                            13,
                            15
                        ]);
                        assertRan(stdout, ...expected);
                    });
                });
            });
            function assertRan(output, ...expected) {
                const lines = output.split('\n');
                for (let i = -1; i < 16; i += 2) {
                    const j = i === -1 ? 'now' : i;
                    const included = lines.some(line => !!line.match(new RegExp(`I am ${j}$`)));
                    if (expected.includes(j)) {
                        chai_1.assert.ok(included, j + ' was supposed to be included in output');
                    }
                    else {
                        chai_1.assert.ok(!included, j + ' was not supposed to be included in output');
                    }
                }
            }
        });
    });
    function run(commandLine) {
        return new Promise((resolve, reject) => {
            cp.exec(commandLine, function (err, stdout, stderr) {
                if (err)
                    return reject(err);
                resolve({ stdout, stderr });
            });
        });
    }
});
