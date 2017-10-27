import {wipeWorkspace, createMigration, assertMigrations, configure, expectFailure} from './test-utils'
import {runMigrations} from '../src/core'
import {assert} from 'chai'

describe('confirmation-test', function () {
  beforeEach(wipeWorkspace)

  it('by default no confirmation is required', async function () {
    configure()
    createMigration('a')
    await runMigrations()
    assertMigrations(['a'])
  })

  describe('run-time confirmation', function () {
    before(configure)

    it('is done before running migrations', async function () {
      createMigration('a')
      let confirmed
      await runMigrations({
        confirmation: () => {
          assertMigrations([])
          confirmed = true
          return true
        }
      })
      assertMigrations(['a'])
      assert.ok(confirmed)
    })

    it('can prevent migrations', async function () {
      createMigration('a')
      await runMigrations({confirmation: () => false})
      assertMigrations([])
    })

    it('can throw to cause the migration running to throw', async function () {
      createMigration('a')
      await expectFailure(runMigrations({
        confirmation: () => {
          throw new Error('stop')
        }
      }))
    })

    it('can allow migrations to be run', async function () {
      createMigration('a')
      await runMigrations({confirmation: () => true})
      assertMigrations(['a'])
    })

    it('is not called if no migrations are about to be run', async function () {
      createMigration('a')
      await runMigrations()
      let confirmed = false
      await runMigrations({confirmation: () => confirmed = true})
      assert.ok(!confirmed)
    })

    it('can be asynchronous', async function () {
      createMigration('a')
      await runMigrations({confirmation: async () => false})
      assertMigrations([])
      await runMigrations({confirmation: async () => true})
      assertMigrations(['a'])
    })


    it('can access migrations', async function () {
      createMigration('a')
      await runMigrations({confirmation: migrations => {
        assert.equal(migrations[0].friendlyName, 'a')
        return true
      }})
    })
  })

  describe('config confirmation', function () {
    it('is done before running migrations', async function () {
      let confirmed
      configure({
        confirmation: () => {
          assertMigrations([])
          confirmed = true
          return true
        }
      })
      createMigration('a')
      await runMigrations()
      assertMigrations(['a'])
      assert.ok(confirmed)
    })

    it('can prevent migrations', async function () {
      configure({confirmation: () => false})
      createMigration('a')
      await runMigrations()
      assertMigrations([])
    })

    it('can throw to cause the migration running to throw', async function () {
      createMigration('a')
      await expectFailure(runMigrations({
        confirmation: () => {
          throw new Error('stop')
        }
      }))
    })

    it('can allow migrations to be run', async function () {
      configure({confirmation: () => true})
      createMigration('a')
      await runMigrations()
      assertMigrations(['a'])
    })

    it('is not called if no migrations are about to be run', async function () {
      let confirmed
      configure({confirmation: () => confirmed = true})
      createMigration('a')
      await runMigrations()
      confirmed = false
      await runMigrations()
      assert.ok(!confirmed)
    })

    it('can be asynchronous', async function () {
      let confValue = false
      configure({confirmation: async () => confValue})
      createMigration('a')
      await runMigrations()
      assertMigrations([])
      confValue = true
      await runMigrations()
      assertMigrations(['a'])
    })

    it('can access migrations', async function () {
      createMigration('a')
      configure({confirmation: (migrations : Migration[]) => {
        assert.equal(migrations[0].friendlyName, 'a')
        return true
      }})
      await runMigrations()
    })
  })

  describe('combination confirmation', function () {
    describe('either confirmation can block migrations', function () {
      interface TP { conf: boolean, runtime: boolean, [index: string]: boolean}
      let toPass : TP
      const runtimeConfirm = confirmer('runtime')
      before(function () {
        configure(confirmer('conf'))
      })

      function confirmer(key : string) {
        return {confirmation: () => toPass[key]}
      }

      beforeEach(function () {
        createMigration('a')
      })

      it('both', async function () {
        toPass = {conf: false, runtime: false}
        await runMigrations(runtimeConfirm)
        assertMigrations([])
      })

      it('runtime', async function () {
        toPass = {conf: true, runtime: false}
        await runMigrations(runtimeConfirm)
        assertMigrations([])
      })

      it('config', async function () {
        toPass = {conf: false, runtime: true}
        await runMigrations(runtimeConfirm)
        assertMigrations([])
      })

      it('neither', async function () {
        toPass = {conf: true, runtime: true}
        await runMigrations(runtimeConfirm)
        assertMigrations(['a'])
      })
    })

    it('config migration is not called if runtime migration blocks', async function () {
      configure({
        confirmation: () => {
          throw new Error('Should not end up here')
        }
      })
      createMigration('a')
      await runMigrations({confirmation: () => false})
    })

    describe('throwing causes migration running to throw', function () {
      before(function () {
        configure({
          confirmation: () => {
            throw new Error('Config')
          }
        })
      })

      it('runtime', async function () {
        createMigration('a')
        await expectFailure(runMigrations({
          confirmation: () => {
            throw new Error('Runtime')
          }
        }), err => assert.equal(err.message, 'Runtime'))
      })

      it('config', async function () {
        createMigration('a')
        await expectFailure(runMigrations({confirmation: () => true}), err => assert.equal(err.message, 'Config'))
      })
    })

    it('config confirmation is given the return value from run-time confirmation', async function () {
      const value = 'test value'
      createMigration('a')
      let confirmed = false
      configure({
        confirmation: (migrations: Migration[], msg : string) => {
          assert.equal(msg, value)
          confirmed = true
        }
      })
      await runMigrations({confirmation: () => value})
      assert.ok(confirmed)
    })
  })


})