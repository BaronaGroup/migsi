
import * as fs from 'fs'
import * as path from 'path'
import * as core from '../src/core'
import {assert} from 'chai'
import {setupConfig} from '../src/config'
import * as _ from 'lodash'
import jsonFileStorage from '../src/storage/json-file'

const testResultFile = __dirname + '/../test-workspace/output.json'
const isInTestWorkspace = /test-workspace/

export const wipeTestModuleCache = function() {
  const testModules = Object.keys(require.cache).filter(key => isInTestWorkspace.test(key))
  for (let testModuleName of testModules) {
    delete require.cache[testModuleName]
  }
}

export const wipeWorkspace = function() {
  const workspacePath = __dirname + '/../test-workspace';
  emptyDirectory(workspacePath)
  wipeTestModuleCache()
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath)
  }
}

function emptyDirectory(directory : string) {
  if (!fs.existsSync(directory)) return
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

export const configure = function(overrides = {}) {
  const storage = jsonFileStorage(__dirname + '/../test-workspace/status.json')
  const configObject = Object.assign({
    storage: storage,
    migrationDir: __dirname + '/../test-workspace',
    prefixAlgorithm: () => ''
  }, overrides)

  setupConfig(configObject)
}

export const createMigration = function(name : string, opts : any = {}) {
  opts.friendlyName = name
  let fullFilename = `${__dirname}/../test-workspace/${name}.migsi.js`
  const defaultRun = (async function() {
    const testUtils = require('../test/test-utils')
    await testUtils.runImpl(opts.friendlyName)
  }).toString()

  const run = (opts.run || function() {
    return this.__run()
  }).toString()
  const rollback = opts.rollback === true ? (async function() {
    const testUtils = require('../test/test-utils')
    await testUtils.rollbackImpl(opts.friendlyName)
  }).toString() : opts.rollback

  fs.writeFileSync(fullFilename, `
  
  const opts = ${JSON.stringify(_.omit(opts, 'run', 'rollback'), null, 2)}
  
module.exports = Object.assign({
  run: ${run},
  __run: ${defaultRun},
  rollback: ${rollback}
}, opts)
  `,
  'UTF-8')
  return fullFilename
}

export const runMigrations = async function(production: boolean = false, extraOpts: any = {}) {
  return core.runMigrations(Object.assign({production}, extraOpts))
}

export const runImpl = (testName : string) => {
  const results = loadTestResults()
  results.push(testName)
  fs.writeFileSync(testResultFile, JSON.stringify(results, null, 2), 'UTF-8')
}

export const rollbackImpl = (testName : string) => {
  const results = loadTestResults()
  results.push("rollback:" + testName)
  fs.writeFileSync(testResultFile, JSON.stringify(results, null, 2), 'UTF-8')
}

function loadTestResults() {
  if (!fs.existsSync(testResultFile)) return []
  return JSON.parse(fs.readFileSync(testResultFile, 'UTF-8'))
}

export const assertMigrations = function(expected : string[]) {
  const data = loadTestResults()
  assert.deepEqual(data, expected)
}

export const replaceInFile = function(filename : string, regexp: RegExp | string, replacement: string) {
  const data = fs.readFileSync(filename, 'UTF-8')
  fs.writeFileSync(filename, data.replace(regexp, replacement), 'UTF-8')
}

export const expectFailure = function(promise : Promise<any>, failureAssert? : (error : Error) => void) {
  return promise.then(function() {
    throw new Error('Expected a failure')
  }, function(err) {
    if (failureAssert) return failureAssert(err)
  })
}