import {wipeWorkspace, createMigration, runMigrations, configure, expectFailure} from './test-utils'
import noneStorage from '../src/storage/none'
import {assert} from 'chai'
import * as _ from 'lodash'

describe('none-storage-test', function () {
  beforeEach(wipeWorkspace)
  before(() => configure({storage: noneStorage}))

  it('assumes no migrations have been run', async function () {
    createMigration('a')
    const migrations = await runMigrations(false, {dryRun: true})
    assert.deepEqual(_.map(migrations, 'friendlyName'), ['a'])
  })

  it('will not allow running new migrations', async function () {
    createMigration('a')
    await expectFailure(runMigrations(false), e => assert.equal(e.message, 'Storage "none" does not support running migrations.'))
  })
})