const {wipeWorkspace, configure, runMigrations, expectFailure, assertMigrations, createMigration, replaceInFile, wipeTestModuleCache} = require('./test-utils'),
  core = require('../src/core'),
  fs = require('fs'),
  {assert} = require('chai'),
  path = require('path')

describe('config-options-test', function () {
  beforeEach(wipeWorkspace)

  it('migrationDir', async function () {
    const migrationFilename = __dirname + '/../test-workspace/alpha/beta.migsi.js'
    assert.ok(!fs.existsSync(migrationFilename))
    const migrationDir = __dirname + '/../test-workspace/alpha'
    fs.mkdirSync(migrationDir)
    configure({migrationDir})
    await core.createMigrationScript('beta')
    assert.ok(fs.existsSync(migrationFilename))
    await expectFailure(runMigrations(), err => assert.equal(err.message, 'Not implemented'))
  })

  describe('templateDir', function () {
    const cases = [
      {label: 'new templates', templateName: 'new-template'},
      {label: 'overriding default templates', templateName: 'default'}
    ]

    for (let {label, templateName} of cases) {
      it(label, async function () {
        const templateDir = path.join(__dirname, '..', 'test-workspace') // we might as well use the workspace directly
        configure({templateDir})
        const templateData = `
        module.exports = { run()  { require('../test/test-utils').runImpl('template-${templateName}')} } `
        fs.writeFileSync(path.join(templateDir, templateName + '.js'), templateData, 'UTF-8')
        await core.createMigrationScript('migration', templateName)
        await runMigrations()
        await assertMigrations([`template-${templateName}`])
      })
    }

  })

  describe('failOnDevelopmentScriptsInProductionMode ', function () {

    beforeEach(async function () {
      createMigration('a', {inDevelopment: false})
      createMigration('b', {inDevelopment: true, dependencies: ['a']})
    })

    it('unset', async function () {
      configure()
      await runMigrations(true)
      assertMigrations(['a'])
    })

    it('set to true', async function () {
      configure({failOnDevelopmentScriptsInProductionMode: true})
      await expectFailure(runMigrations(true))
    })
  })

  describe('storage', function () {
    it('uses provided storage', async function () {
      const stored = []
      configure({
        storage: {
          async loadPastMigrations() {
            return [
              {
                migsiName: 'a',
                hasBeenRun: true
              }
            ]
          },
          async updateStatus(migration) {
            stored.push(migration.migsiName)
          }
        }
      })
      createMigration('a')
      createMigration('b')
      await runMigrations()
      assertMigrations(['b'])
      assert.deepEqual(stored, ['b'])
    })
  })

  describe('allowRerunningAllMigrations ', function () {
    async function body() {
      const script = createMigration('a', {version: 'hash', 'token': 'TOKEN'})
      await runMigrations()
      replaceInFile(script, /TOKEN/, 'TOKEN2')
      wipeTestModuleCache()
      await runMigrations()
    }

    it('set to false', async function () {
      configure({allowRerunningAllMigrations: false})
      await body()
      assertMigrations(['a'])
    })

    it('set to true', async function () {
      configure({allowRerunningAllMigrations: true})
      await body()
      assertMigrations(['a', 'a'])
    })
  })

  describe('prefixAlgorithm ', function () {
    it('simple prefix', async function() {
      configure({prefixAlgorithm: () => 'howdy'})
      await core.createMigrationScript('test')
      assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/howdytest.migsi.js')))
    })

    it('with a path', async function() {
      configure({prefixAlgorithm: () => 'dir/name/'})
      await core.createMigrationScript('test')
      assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/dir/name/test.migsi.js')))
    })
  })

  describe('confirmation', function() {
    // The tests are implemented in confirmation-test.js
  })
})