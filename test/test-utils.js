const fs = require('fs'),
  path = require('path'),
  core = require('../src/core'),
  {assert} = require('chai'),
  config = require('../src/config'),
  _ = require('lodash')

const testResultFile = __dirname + '/../test-workspace/output.json'
const isInTestWorkspace = /test-workspace/

const wipeTestModuleCache = exports.wipeTestModuleCache = function() {
  const testModules = Object.keys(require.cache).filter(key => isInTestWorkspace.test(key))
  for (let testModuleName of testModules) {
    delete require.cache[testModuleName]
  }
}

exports.wipeWorkspace = function() {
  emptyDirectory(__dirname + '/../test-workspace')
  wipeTestModuleCache()
}

function emptyDirectory(directory) {
  const files = fs.readdirSync(directory)
  for (let file of files) {
    if (file === '.gitplaceholder') continue
    const ffn = path.join(directory, file)
    if (fs.statSync(ffn).isDirectory()) {
      emptyDirectory(ffn)
      fs.rmdirSync(ffn)
    } else {
      fs.unlinkSync(ffn)
    }
  }
}

exports.configure = function(overrides = {}) {
  config.setupConfig(Object.assign({
    storage: require('../src/storage/json-file')(__dirname + '/../test-workspace/status.json'),
    migrationDir: __dirname + '/../test-workspace',
    prefixAlgorithm: () => ''
  }, overrides))
}

exports.createMigration = function(name, opts = {}) {
  opts.friendlyName = name
  let fullFilename = `${__dirname}/../test-workspace/${name}.migsi.js`
  const run = (opts.run || async function() {
    const testUtils = require('../test/test-utils')
    await testUtils.runImpl(opts.friendlyName)
  }).toString()
  fs.writeFileSync(fullFilename, `
  
  const opts = ${JSON.stringify(_.omit(opts, 'run'), null, 2)}
  
module.exports = Object.assign({
  run: ${run}
}, opts)
  `,
  'UTF-8')
  return fullFilename
}

exports.runMigrations = async function(production) {
  return core.runMigrations(production, true)
}

exports.runImpl = testName => {
  const results = loadTestResults()
  results.push(testName)
  fs.writeFileSync(testResultFile, JSON.stringify(results, null, 2), 'UTF-8')
}

function loadTestResults() {
  if (!fs.existsSync(testResultFile)) return []
  return JSON.parse(fs.readFileSync(testResultFile, 'UTF-8'))
}

exports.assertMigrations = function(expected) {
  const data = loadTestResults()
  assert.deepEqual(data, expected)
}

exports.replaceInFile = function(filename, regexp, replacement) {
  const data = fs.readFileSync(filename, 'UTF-8')
  fs.writeFileSync(filename, data.replace(regexp, replacement), 'UTF-8')
}

exports.expectFailure = function(promise, failureAssert) {
  return promise.then(function() {
    throw new Error('Expected a failure')
  }, function(err) {
    if (failureAssert) return failureAssert(err)
  })
}