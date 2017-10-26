const {wipeWorkspace, runMigrations, expectFailure, assertMigrations, createMigration} = require('./test-utils'),
  path = require('path'),
  fs = require('fs'),
  {assert} = require('chai'),
  cp = require('child_process'),
  config = require('../src/config')

describe('command-line-tool-test', function () {
  const workspace = path.join(__dirname, '..', 'test-workspace'),
    configFile = path.join(workspace, 'config.js'),
    storageFile = path.join(workspace, 'storage.json')

  beforeEach(function () {
    wipeWorkspace()
    fs.writeFileSync(configFile, `
      module.exports = {
        migrationDir: '${workspace}',
        templateDir: '${workspace}',
        storage: require('${path.join(__dirname, '..', 'storage' , 'json-file')}')('${storageFile}'),
        prefixAlgorithm: () => ''
      }
   `, 'UTF-8')
    config.loadConfig(configFile)
  })

  describe('create', function () {
    it('with name on command line', async function() {
      await run(`node bin/migsi create --config=${configFile} --name=another`)
      const script = path.join(workspace, 'another.migsi.js')
      assert.ok(fs.existsSync(script))
      const loaded = require(script)
      assert.equal(loaded.friendlyName, 'another')
      await expectFailure(runMigrations(), e => assert.equal(e.message, 'Not implemented'))
    })

    it('with another template', async function() {
      fs.writeFileSync(path.join(workspace, 'custom.js'), `
      module.exports = { run() { throw new Error('Is custom') }}
      `, 'UTF-8')

      await run(`node bin/migsi create --config=${configFile} --name=third --template=custom`)
      const script = path.join(workspace, 'third.migsi.js')
      assert.ok(fs.existsSync(script))
      await expectFailure(runMigrations(), e => assert.equal(e.message, 'Is custom'))
    })
  })

  describe('run', function () {
    describe('confirmation', function() {
      // since there often is no TTY for the tests, the confirmation tests are omitted for the time being
    })

    beforeEach(function() {
      createMigration('a', {inDevelopment: false})
      createMigration('b', {inDevelopment: true, dependencies: ['a']})
    })

    it('is able to run all scripts', async function() {
      await run(`node bin/migsi run --config=${configFile} --yes`)
      assertMigrations(['a', 'b'])
    })

    it('is able to run production scripts', async function() {
      await run(`node bin/migsi run --config=${configFile} --production --yes`)
      assertMigrations(['a'])
    })

    it('supports dry-run', async function() {
      await run(`node bin/migsi run --config=${configFile} --production --yes --dry-run`)
      assertMigrations([])
    })

  })

  describe('list', function () {
    it('lists migrations in order along with their run dates, when relevant', async function() {
      createMigration('script1')
      createMigration('script2', { dependencies: ['script1']})
      await runMigrations()
      createMigration('newscript')
      const {stdout} = await run(`MIGSI_QUIET= node bin/migsi list --config=${configFile}`)
      const lines = stdout.split('\n')
      const hasDate = /20\d\d/
      assert.ok(lines[0].includes('script1'))
      assert.ok(hasDate.test(lines[0]))
      assert.ok(lines[1].includes('script2'))
      assert.ok(hasDate.test(lines[1]))
      assert.ok(lines[2].includes('newscript'))
      assert.ok(lines[2].includes('to-be-run'))
    })
  })

  describe('ensure-no-development-scripts', function () {
    it('passes if there are no development scripts', async function() {
      createMigration('a', {inDevelopment: false})
      await run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`)
    })

    it('fails if there are development scripts', async function() {
      createMigration('a', {inDevelopment: true})
      await expectFailure(run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`))
    })
  })

  describe('output', function() {
    describe('data', function () {
      it('is able to display stdout')
      it('is able to display stderr')
      it('is able to display exceptions')
      it('raw')
    })

    describe('filtering', function() {
      it('by name')
      it('failed')
      it('since')
      it('until')
      it('combined since and until')
    })
  })

  function run(commandLine) {
    return new Promise((resolve, reject) => {
      cp.exec(commandLine, function (err, stdout, stderr) {
        if (err) return reject(err)
        resolve({stdout, stderr})
      })
    })
  }
})