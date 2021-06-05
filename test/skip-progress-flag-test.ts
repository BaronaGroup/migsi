import { wipeWorkspace, createMigration, runMigrations, assertMigrations, configure } from './test-utils'

describe('skip-progress-flag-test', function () {
  before(configure)
  beforeEach(wipeWorkspace)

  it('with the flag present migration scripts do not get flagged as having been run', async function () {
    await createMigration('a')
    await runMigrations(false, { skipProgressFlag: true })
    await runMigrations()
    await assertMigrations(['a', 'a'])
  })

  it('scripts do get to know if they have been run via hasActuallyBeenRun', async function () {
    await createMigration('a', {
      run: function () {
        require('../test/test-utils').runImpl(['script', !!this.hasBeenRun, !!this.hasActuallyBeenRun].join(' '))
      },
    })
    await runMigrations(false, { skipProgressFlag: true })
    await runMigrations(false)

    await assertMigrations(['script false false', 'script false true'])
  })
})
