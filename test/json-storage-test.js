"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const json_file_1 = require("../src/storage/json-file");
const path = require("path");
const chai_1 = require("chai");
const fs = require("fs");
describe('json-storage-test', function () {
    beforeEach(test_utils_1.wipeWorkspace);
    it('allows providing an absolute file name', async function () {
        const filename = path.join(__dirname, '..', 'test-workspace', 'storage.json');
        test_utils_1.configure({ storage: json_file_1.default(filename) });
        await test_utils_1.createMigration('a');
        chai_1.assert.ok(!fs.existsSync(filename), 'Storage file should not exist before running migrations');
        await test_utils_1.runMigrations();
        chai_1.assert.ok(fs.existsSync(filename), 'Storage file should exist after running migrations');
    });
    it('throws without a filename', async function () {
        await test_utils_1.expectFailure(async function () {
            test_utils_1.configure({ storage: json_file_1.default('') });
        }());
    });
    it('works', async function () {
        const filename = path.join(__dirname, '..', 'test-workspace', 'storage.json');
        test_utils_1.configure({ storage: json_file_1.default(filename) });
        await test_utils_1.createMigration('a');
        await test_utils_1.runMigrations();
        await test_utils_1.createMigration('b');
        await test_utils_1.runMigrations();
        test_utils_1.assertMigrations(['a', 'b']);
    });
});
