import * as fs from 'fs'
import * as path from 'path'

import { assert } from 'chai'

import * as core from '../src/core'
import { assertMigrations, configure, createMigration, runMigrations, wipeWorkspace } from './test-utils'

describe('implicit-dependencies-test', function () {
  const templateDir = path.join(__dirname, '../test-workspace'),
    templateName = 'impldep'

  before(() => configure({ templateDir }))
  beforeEach(wipeWorkspace)
  beforeEach(setupTemplate)

  it('if there are no migrations, there are no implicit dependencies', async function () {
    await core.createMigrationScript('a', templateName)
    await runMigrations()
    await assertMigrations(['a'])
    await checkDependencyArray('a', [])
  })

  it('a single existing migration becomes an implicit dependency', async function () {
    await createMigration('a')
    await core.createMigrationScript('b', templateName)
    await runMigrations()
    await assertMigrations(['a', 'b'])
    await checkDependencyArray('b', ['a'])
  })

  it('a chain of migrations has its head become an implicit dependency', async function () {
    await createMigration('a')
    await createMigration('b', { dependencies: ['a'] })
    await createMigration('c', { dependencies: ['b'] })
    await core.createMigrationScript('d', templateName)
    await runMigrations()
    await assertMigrations(['a', 'b', 'c', 'd'])
    await checkDependencyArray('d', ['c'])
  })

  it('multiple chains of migrations have their heads become implit dependencies', async function () {
    await createMigration('a')
    await createMigration('b', { dependencies: ['a'] })
    await createMigration('c')
    await createMigration('d', { dependencies: ['c'] })
    await core.createMigrationScript('e', templateName)
    await runMigrations()
    await assertMigrations(['c', 'd', 'a', 'b', 'e'])
    await checkDependencyArray('e', ['d', 'b'])
  })

  it('a wild tree produces wild results', async function () {
    await createMigration('a') // top level migration
    await createMigration('e') // another top level migration
    await createMigration('b', { dependencies: ['a'] })
    await createMigration('c', { dependencies: ['b'] }) // two-level child
    await createMigration('d', { dependencies: ['a'] }) // one-level child
    await core.createMigrationScript('f', templateName)
    await runMigrations()
    await assertMigrations(['e', 'a', 'd', 'b', 'c', 'f'])
    await checkDependencyArray('f', ['e', 'd', 'c'])
  })

  async function setupTemplate() {
    const templateData = `module.exports = {
    friendlyName: '[[FRIENDLY_NAME]]',
    dependencies: '[[IMPLICIT_DEPENDENCIES]]', 
    run() {
      const testUtils = require('../test/test-utils')
      return testUtils.runImpl(this.friendlyName)
    }}
    `
    fs.writeFileSync(templateDir + '/' + templateName + '.template.js', templateData, 'utf-8')
  }

  async function checkDependencyArray(migrationName: string, expected: string[]) {
    const migrations = await core.loadAllMigrations()
    const migration = migrations.find((m) => m.friendlyName === migrationName)
    if (!migration) throw new Error('Failed to find tested migration')
    assert.deepEqual(migration.dependencies, expected)
  }
})
