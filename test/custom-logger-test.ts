import { wipeWorkspace, createMigration, runMigrations, configure, expectFailure } from './test-utils'
import noneStorage from '../src/storage/none'
import { assert } from 'chai'
import * as _ from 'lodash'
import { getLogger } from '../src/utils'

interface LogOutput {
  info: any[][]
  error: any[][]
  warn: any[][]
}

describe('custom-logger-test', function () {
  beforeEach(wipeWorkspace)
  describe('uses the logger instead of regular console functions', function () {
    it(
      'for info',
      loggerTest({}, async function (logged) {
        createMigration('a')
        const migrations = await runMigrations(false)
        const codesPresent = logged.info[1][0].includes('\u001b')

        assert.deepEqual(logged.info, [
          ['Migrations to be run:\na'],
          [`${codesPresent ? '\u001b[38;5;33m' : ''}Running:${codesPresent ? '\u001b[39m' : ''}`, 'a'],
          [`${codesPresent ? '\u001b[38;5;40m' : ''}Success:${codesPresent ? '\u001b[39m' : ''}`, 'a, duration 0 s'],
        ])
      })
    )

    it(
      'for warn',
      loggerTest({ rollbackAll: true }, async function (logged) {
        createMigration('1')
        createMigration('2', {
          dependencies: ['1'],
          rollback: true,
          run: () => {
            throw new Error('failure')
          },
        })
        const migrations = await expectFailure(runMigrations(false))
        assert.deepEqual(logged.warn, [
          ['Not all run migration scripts support rollback; only rolling back the last 1 migration scripts'],
        ])
      })
    )

    it(
      'for error',
      loggerTest({}, async function (logged) {
        // no good way to get an error from production code
        getLogger().error('Test error')
        assert.deepEqual(logged.error, [['Test error']])
      })
    )
  })

  function loggerTest(configOpts: object, testImpl: (logged: LogOutput) => Promise<void>) {
    const logged: LogOutput = {
      info: [],
      error: [],
      warn: [],
    }
    const specialLogger = {
      info: logFor('info'),
      error: logFor('error'),
      warn: logFor('warn'),
    }

    return async function () {
      configure({
        logger: specialLogger,
        ...configOpts,
      })
      await testImpl(logged)
    }

    function logFor(type: 'info' | 'warn' | 'error') {
      return (...args: any[]) => {
        logged[type].push(args)
      }
    }
  }
})
