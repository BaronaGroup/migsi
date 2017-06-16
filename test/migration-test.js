const {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure, replaceInFile} = require('./test-utils')

describe('migration-test', function () {
  before(configure)
  beforeEach(wipeWorkspace)

  describe('simple cases', function () {
    it('a sequence of migrations', async function () {
      await createMigration('a')
      await createMigration('b')
      await createMigration('c')
      await runMigrations()
      await assertMigrations(['a', 'b', 'c'])
    })

    it('running migrations in multiple batches', async function () {
      await createMigration('a')
      await createMigration('b')
      await runMigrations()
      await assertMigrations(['a', 'b'])
      await createMigration('c')
      await createMigration('d')
      await runMigrations()
      await assertMigrations(['a', 'b', 'c', 'd'])
    })

    it('running a dev script again after it has been changed (hash)', async function () {
      const filename = await createMigration('dev', {token: '__TOKEN__', inDevelopment: true, version: 'hash'})
      await runMigrations()
      await assertMigrations(['dev'])
      replaceInFile(filename, /__TOKEN__/, 'Token2')
      require(filename).version = 'hash'
      await runMigrations()
      await assertMigrations(['dev', 'dev'])
    })

    it('is possible to specify an explicit dependency', async function () {
      const a = await createMigration('a')
      await createMigration('b', {dependencies: [a.migsiName]})
      await runMigrations()
      await assertMigrations(['b', 'a'])
    })
    it('is possible to specify multiple dependencies', async function () {
      await createMigration('a', { dependencies: ['c']}, {explicitName: '0000-a'})
      await createMigration('b', {dependencies: ['a', 'd']})
      await createMigration('c', {dependencies: ['x']})
      await createMigration('d', {dependencies: ['a', 'c']})
      await runMigrations()
      await assertMigrations(['c', 'a', 'd', 'b'])
    })
  })
})