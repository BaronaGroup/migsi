const fs = require('fs'),
  path = require('path'),
  core = require('../src/core'),
  {assert} = require('chai'),
  cp = require('child_process'),
  config = require('../src/config')

let index = 1
const testResultFile = __dirname + '/../test-workspace/output.json'

exports.wipeWorkspace = function() {
  emptyDirectory(__dirname + '/../test-workspace')
}

function emptyDirectory(directory) {
  const files = fs.readdirSync(directory)
  for (let file of files) {
    if (file === '.gitplaceholder') continue
    const ffn = path.join(directory, file)
    if (fs.statSync(ffn).isDirectory()) {
      emptyDirectory(ffn)
    }
    fs.unlinkSync(ffn)
  }
}

exports.configure = function() {
  config.setupConfig({
    storage: require('../storage/json-file')(__dirname + '/../test-workspace/status.json'),
    migrationDir: __dirname + '/../test-workspace'
  })
}

exports.createMigration = function(name, opts = {}) {
  opts.friendlyName = name
  let fullFilename = `${__dirname}/../test-workspace/${pad(index++, 6)}-${name}.migsi.js`
  fs.writeFileSync(fullFilename, `
  const testUtils = require('../test/test-utils') 
  const opts = ${JSON.stringify(opts, null, 2)}
  
module.exports = Object.assign({
  run: async function() {
    testUtils.runImpl(opts.friendlyName)
  }
}, opts)
  `,
  'UTF-8')
  return fullFilename
}

exports.runMigrations = async function(production) {
  return core.runMigrations(production, true)
}


function pad(input, to = 2) {
  const str = input.toString()
  if (str.length >= to) return str
  return ('0000' + str).substr(-to)
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