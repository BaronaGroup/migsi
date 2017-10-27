import {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure, expectFailure} from './test-utils'
import jsonStorage from '../src/storage/json-file'
import * as path from 'path'
import {assert} from 'chai'
import * as fs from 'fs'

describe('json-storage-test', function () {
  beforeEach(wipeWorkspace)

  it('allows providing an absolute file name', async function () {
    const filename = path.join(__dirname, '..', 'test-workspace', 'storage.json')
    configure({storage: jsonStorage(filename)})
    await createMigration('a')
    assert.ok(!fs.existsSync(filename), 'Storage file should not exist before running migrations')
    await runMigrations()
    assert.ok(fs.existsSync(filename), 'Storage file should exist after running migrations')
  })

  it('throws without a filename', async function () {
    await expectFailure(async function () {
      configure({storage: jsonStorage('')})
    }())
  })

  it('works', async function () {
    const filename = path.join(__dirname, '..', 'test-workspace', 'storage.json')
    configure({storage: jsonStorage(filename)})
    await createMigration('a')
    await runMigrations()
    await createMigration('b')
    await runMigrations()
    assertMigrations(['a', 'b'])
  })
})