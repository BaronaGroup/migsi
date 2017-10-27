import {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure } from './test-utils'

describe('simple-cases', function() {
  before(configure)
  beforeEach(wipeWorkspace)

  it('a single migration', async function() {
    await createMigration('a')
    await runMigrations()
    await assertMigrations(['a'])
  })

  it('a bunch of migrations with trivial dependencies', async function() {
    await createMigration('a', {dependencies: ['b']})
    await createMigration('b')
    await createMigration('c', {dependencies: ['a']})
    await runMigrations()
    await assertMigrations(['b', 'a', 'c'])
  })
})