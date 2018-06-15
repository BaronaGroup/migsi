import {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure } from './test-utils'
import * as core from '../src/core'
import {reset} from '../src/migsi-status'

describe('archived-migration-test', function() {

  before(configure)
  beforeEach(wipeWorkspace)

  it('if only archived migrations exist, only those are run', async function() {
    await createMigration('a', {archived: true})
    await runMigrations()
    await assertMigrations([])
  })

  it('only migrations following archived ones are run', async function() {
    await createMigration('a', {dependencies: ['b'], archived: true})
    await createMigration('b', {archived: true})
    await createMigration('c', {dependencies: ['a']})
    await runMigrations()
    await assertMigrations(['c'])
  })

  it('archived migrations in the middle are skipped', async function() {
    await createMigration('a', {dependencies: ['b'], archived: true})
    await createMigration('b')
    await createMigration('c', {dependencies: ['a']})
    await runMigrations()
    await assertMigrations(['b', 'c'])
  })

  it('archival can be done using an API on core', async function() {
    await createMigration('a')
    await createMigration('b', {dependencies: ['a']})
    const migrations = await core.loadAllMigrations()
    await core.archive(migrations[0])
    await runMigrations()
    await assertMigrations(['b'])
    await reset()
  })
})