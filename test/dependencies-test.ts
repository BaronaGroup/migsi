import {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure, expectFailure} from './test-utils'

describe('dependencies-test', function () {
  before(function () {
    configure()
  })

  beforeEach(function () {
    wipeWorkspace()
  })

  it('migrations can have multiple dependencies', async function () {
    createMigration('a')
    createMigration('b', {dependencies: ['a', 'd']})
    createMigration('c', {dependencies: ['a']})
    createMigration('d')

    await runMigrations()

    assertMigrations(['a', 'c', 'd', 'b'])
  })

  it('with migrations dependant on the sames dependencies, production migrations are preferred', async function() {
    createMigration('a')
    createMigration('b', {inDevelopment: true, dependencies: ['a']})
    createMigration('c', {inDevelopment: false, dependencies: ['a']})

    await runMigrations()

    assertMigrations(['a', 'c', 'b'])
  })


  it('missing dependencies are a major error', async function() {
    createMigration('a', {dependencies: ['-1']})
    await expectFailure(runMigrations())
  })

  it('dependency loops are a major error', async function() {
    createMigration('a', {dependencies: ['b']})
    createMigration('b', {dependencies: ['a']})
    await expectFailure(runMigrations())
  })

  it('fixing dependency order works correctly (bugfix 1.2.1)', async function() {
    createMigration('a', {dependencies: []})
    createMigration('d', {dependencies: []})
    createMigration('g', {dependencies: []})
    await runMigrations(true)
    createMigration('b', {dependencies: ['a']})
    createMigration('e', {dependencies: ['d']})
    createMigration('f', {dependencies: ['d']})
    await runMigrations(true)
  })

  it('fixing dependency order works correctly (bugfix 1.2.2)', async function() {
    createMigration('base', {dependencies: [], inDevelopment: false})
    createMigration('a', {dependencies: ['base'], inDevelopment: true})
    await runMigrations(false)
    createMigration('b', {dependencies: ['base'], inDevelopment: false})
    await runMigrations(false)
  })
})