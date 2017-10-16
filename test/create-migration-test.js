const {wipeWorkspace, configure, runMigrations, expectFailure} = require('./test-utils'),
  core = require('../src/core'),
  fs = require('fs'),
  {assert} = require('chai'),
  path = require('path')


describe('create-migration-test.js', function () {
  before(function () {
    configure()
  })

  beforeEach(function () {
    wipeWorkspace()
  })

  it('is able to create migrations', async function () {
    await core.createMigrationScript('eins')
    const migrations = await core.loadAllMigrations()
    assert.ok(fs.existsSync(path.join(__dirname, '../test-workspace/eins.migsi.js')))
    assert.equal(migrations[0].friendlyName, 'eins')
  })

  describe('it is possible to use', function () {
    it('default templates', async function () {
      await core.createMigrationScript('drei', 'default')

      await expectFailure(runMigrations(), err => assert.equal(err.message, 'Not implemented'))
    })

    it('custom templates', async function () {
      const templateDir = path.join(__dirname, '../test-workspace')
      configure({templateDir})
      const templateData = `module.exports = { run() { throw new Error('custom')}}`
      fs.writeFileSync(templateDir + '/custom.js', templateData, 'UTF-8')
      await core.createMigrationScript('drei', 'custom')

      await expectFailure(runMigrations(), err => assert.equal(err.message, 'custom'))
    })

    it('custom templates with .template.js', async function () {
      const templateDir = path.join(__dirname, '../test-workspace')
      configure({templateDir})
      const templateData = `module.exports = { run() { throw new Error('custom')}}`
      fs.writeFileSync(templateDir + '/custom.template.js', templateData, 'UTF-8')
      await core.createMigrationScript('drei', 'custom')

      await expectFailure(runMigrations(), err => assert.equal(err.message, 'custom'))
    })
  })

  it('friendly name is set up properly within the migration (assuming template support)', async function () {
    await core.createMigrationScript('zwei')
    const migrations = await core.loadAllMigrations()
    assert.equal(migrations[0].friendlyName, 'zwei')
  })

  it('default dependency is set up properly within the migration (assuming template support)', async function () {
    await core.createMigrationScript('ichi')
    await core.createMigrationScript('ni')
    await core.createMigrationScript('san')

    const migrations = await core.loadAllMigrations()
    assert.deepEqual(migrations[0].dependencies, [])
    assert.deepEqual(migrations[1].dependencies, ['ichi'])
    assert.deepEqual(migrations[2].dependencies, ['ni'])
  })
})