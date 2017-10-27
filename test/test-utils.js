"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const core = require("../src/core");
const chai_1 = require("chai");
const config_1 = require("../src/config");
const _ = require("lodash");
const json_file_1 = require("../src/storage/json-file");
const testResultFile = __dirname + '/../test-workspace/output.json';
const isInTestWorkspace = /test-workspace/;
exports.wipeTestModuleCache = function () {
    const testModules = Object.keys(require.cache).filter(key => isInTestWorkspace.test(key));
    for (let testModuleName of testModules) {
        delete require.cache[testModuleName];
    }
};
exports.wipeWorkspace = function () {
    emptyDirectory(__dirname + '/../test-workspace');
    exports.wipeTestModuleCache();
};
function emptyDirectory(directory) {
    const files = fs.readdirSync(directory);
    for (let file of files) {
        if (file === '.gitplaceholder')
            continue;
        const ffn = path.join(directory, file);
        if (fs.statSync(ffn).isDirectory()) {
            emptyDirectory(ffn);
            fs.rmdirSync(ffn);
        }
        else {
            fs.unlinkSync(ffn);
        }
    }
}
exports.configure = function (overrides = {}) {
    const storage = json_file_1.default(__dirname + '/../test-workspace/status.json');
    const configObject = Object.assign({
        storage: storage,
        migrationDir: __dirname + '/../test-workspace',
        prefixAlgorithm: () => ''
    }, overrides);
    config_1.setupConfig(configObject);
};
exports.createMigration = function (name, opts = {}) {
    opts.friendlyName = name;
    let fullFilename = `${__dirname}/../test-workspace/${name}.migsi.js`;
    const defaultRun = (async function () {
        const testUtils = require('../test/test-utils');
        await testUtils.runImpl(opts.friendlyName);
    }).toString();
    const run = (opts.run || function () {
        return this.__run();
    }).toString();
    const rollback = opts.rollback === true ? (async function () {
        const testUtils = require('../test/test-utils');
        await testUtils.rollbackImpl(opts.friendlyName);
    }).toString() : opts.rollback;
    fs.writeFileSync(fullFilename, `
  
  const opts = ${JSON.stringify(_.omit(opts, 'run', 'rollback'), null, 2)}
  
module.exports = Object.assign({
  run: ${run},
  __run: ${defaultRun},
  rollback: ${rollback}
}, opts)
  `, 'UTF-8');
    return fullFilename;
};
exports.runMigrations = async function (production = false, extraOpts = {}) {
    return core.runMigrations(Object.assign({ production }, extraOpts));
};
exports.runImpl = (testName) => {
    const results = loadTestResults();
    results.push(testName);
    fs.writeFileSync(testResultFile, JSON.stringify(results, null, 2), 'UTF-8');
};
exports.rollbackImpl = (testName) => {
    const results = loadTestResults();
    results.push("rollback:" + testName);
    fs.writeFileSync(testResultFile, JSON.stringify(results, null, 2), 'UTF-8');
};
function loadTestResults() {
    if (!fs.existsSync(testResultFile))
        return [];
    return JSON.parse(fs.readFileSync(testResultFile, 'UTF-8'));
}
exports.assertMigrations = function (expected) {
    const data = loadTestResults();
    chai_1.assert.deepEqual(data, expected);
};
exports.replaceInFile = function (filename, regexp, replacement) {
    const data = fs.readFileSync(filename, 'UTF-8');
    fs.writeFileSync(filename, data.replace(regexp, replacement), 'UTF-8');
};
exports.expectFailure = function (promise, failureAssert) {
    return promise.then(function () {
        throw new Error('Expected a failure');
    }, function (err) {
        if (failureAssert)
            return failureAssert(err);
    });
};
