import { wipeWorkspace, createMigration, runMigrations, assertMigrations, configure, expectFailure } from './test-utils'

describe('rollback-test', function () {
  beforeEach(wipeWorkspace)

  describe('full rollback mode', function () {
    before(() => configure({ rollbackAll: true }))

    it('a failed migration can be rolled back', async function () {
      createMigration('a', {
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations(['rollback:a'])
    })

    it('if all migrations support rollback, they are all rolled back on a failure', async function () {
      createMigration('a', { rollback: true })
      createMigration('b', { rollback: true, dependencies: ['a'] })
      createMigration('c', {
        dependencies: ['b'],
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations(['a', 'b', 'rollback:c', 'rollback:b', 'rollback:a'])
    })

    it('if only some of the migrations support rollback, migrations up to that point are rolled back', async function () {
      createMigration('a')
      createMigration('b', { rollback: true, dependencies: ['a'] })
      createMigration('c', {
        dependencies: ['b'],
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations(['a', 'b', 'rollback:c', 'rollback:b'])
    })

    it('migrations from previous runs are not rolled back', async function () {
      createMigration('a', { rollback: true })
      await runMigrations()
      createMigration('b', { rollback: true, dependencies: ['a'] })
      createMigration('c', {
        dependencies: ['b'],
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations(['a', 'b', 'rollback:c', 'rollback:b'])
    })

    it('rolled back migrations are attempted again on the next run', async function () {
      createMigration('a')
      createMigration('b', { rollback: true, dependencies: ['a'] })
      createMigration('c', {
        dependencies: ['b'],
        rollback: true,
        run: function () {
          if (eval('global.fail')) throw new Error('failure') // eslint-disable-line no-eval
          return this.__run()
        },
      })
      const g = <any>global
      g.fail = true
      await expectFailure(runMigrations())
      g.fail = false
      await runMigrations()
      assertMigrations(['a', 'b', 'rollback:c', 'rollback:b', 'b', 'c'])
    })
  })

  describe('single rollback mode', function () {
    before(() => configure({ rollbackAll: false }))

    it('a failed migration can be rolled back', async function () {
      createMigration('a', {
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations(['rollback:a'])
    })

    it('lacking rollback option is fine', async function () {
      createMigration('a', {
        run: () => {
          throw new Error('failure')
        },
      })
      await expectFailure(runMigrations())
      assertMigrations([])
    })

    it('rolled back migrations are attempted again on the next run', async function () {
      const g = <any>global
      g.fail = true
      createMigration('a', {
        rollback: true,
        run: function () {
          if (eval('global.fail')) throw new Error('failure') // eslint-disable-line no-eval
          return this.__run()
        },
      })
      await expectFailure(runMigrations())
      await expectFailure(runMigrations())
      g.fail = false
      await runMigrations()
      assertMigrations(['rollback:a', 'rollback:a', 'a'])
    })

    it('only the failed migration is rolled back', async function () {
      createMigration('a', { rollback: true })
      createMigration('b', {
        rollback: true,
        run: () => {
          throw new Error('failure')
        },
        dependencies: ['a'],
      })
      await expectFailure(runMigrations())
      assertMigrations(['a', 'rollback:b'])
    })
  })
})
