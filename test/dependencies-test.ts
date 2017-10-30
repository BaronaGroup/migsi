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
})