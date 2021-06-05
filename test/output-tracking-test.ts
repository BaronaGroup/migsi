/* eslint no-console: 0 */

import { wipeWorkspace, createMigration, runMigrations, configure, expectFailure } from './test-utils'
import { assert } from 'chai'
import { config } from '../src/config'

describe('output-tracking-test', function () {
  beforeEach(wipeWorkspace)

  describe('disabled', function () {
    before(() => configure({ disableOutputTracking: true }))
    it('is possible to disable output tracking', async function () {
      createMigration('a', { run: () => console.log('sample output') })
      await runMigrations()
      const migration = await getMigration('a')
      if (!migration.output) throw new Error('Output not found')
      assert.isUndefined(migration.output.run)
      assert.isUndefined(migration.output.rollback)
    })
  })

  describe('enabled', function () {
    before(() => configure())

    it('tracks console.log', async function () {
      createMigration('a', { run: () => console.log('sample output') })
      await runMigrations()
      const migration = await getMigration('a')
      assert.equal(migration.output!.run!.stdout![0].data, 'sample output\n')
    })

    it('tracks process.stdout.write', async function () {
      createMigration('a', { run: () => process.stdout.write('another test\n') })
      await runMigrations()
      const migration = await getMigration('a')
      assert.equal(migration.output!.run!.stdout![0].data, 'another test\n')
    })

    it('can be piped output of external processes', async function () {
      createMigration('a', {
        run: () => {
          return new Promise((resolve) => {
            const cp = require('child_process')
            const child = cp.spawn('bash', ['-c', 'cat ../../../package.json | grep name | head -n1'], {
              cwd: __dirname,
              stdio: 'pipe',
            })
            child.stdout.pipe(process.stdout)
            child.stderr.pipe(process.stderr)
            child.on('close', resolve)
          })
        },
      })
      await runMigrations()
      const migration = await getMigration('a')
      assert.equal(migration.output!.run!.stdout![0].data.trim(), '"name": "migsi",')
    })

    it('tracks both stdout and stderr', async function () {
      createMigration('a', {
        run: () => {
          console.log('output')
          console.error('error')
        },
      })
      await runMigrations()
      const migration = await getMigration('a')
      assert.equal(migration.output!.run!.stdout![0].data, 'output\n')
      assert.equal(migration.output!.run!.stderr![0].data, 'error\n')
    })

    it('tracks rollback output', async function () {
      createMigration('a', {
        run: () => {
          throw new Error('stop')
        },
        rollback: () => console.log('rolling back'),
      })
      await expectFailure(runMigrations())
      const migration = await getMigration('a')
      assert.equal(migration.output!.rollback!.stdout![0].data, 'rolling back\n')
    })
  })
})

async function getMigration(name: string) {
  if (!config.storage) throw new Error('Storage not found')
  const pastMigrations = await config.storage.loadPastMigrations()
  const found = pastMigrations.find((m) => m.migsiName === name)
  if (!found) throw new Error('Did not find migration')
  return found
}
