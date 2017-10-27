import {wipeWorkspace, runMigrations, expectFailure, assertMigrations, createMigration} from './test-utils'
import * as path from 'path'
import * as fs from 'fs'
import {assert} from 'chai'
import * as cp from 'child_process'
import {config, loadConfig} from '../src/config'
import * as moment from 'moment'
import * as _ from 'lodash'

interface RunOutput {
  stdout: string
  stderr: string
}

import 'mocha'

describe('command-line-tool-test', function () {
  const workspace = path.join(__dirname, '..', 'test-workspace'),
    configFile = path.join(workspace, 'config.js'),
    storageFile = path.join(workspace, 'storage.json')

  beforeEach(function () {
    wipeWorkspace()
    fs.writeFileSync(configFile, `
      module.exports = {
        migrationDir: '${workspace}',
        templateDir: '${workspace}',
        storage: require('${path.join(__dirname, '..', 'storage', 'json-file')}')('${storageFile}'),
        prefixAlgorithm: () => ''
      }
   `, 'UTF-8')
    loadConfig(configFile)
  })

  describe('create', function () {
    it('with name on command line', async function () {
      await run(`node bin/migsi create --config=${configFile} --name=another`)
      const script = path.join(workspace, 'another.migsi.js')
      assert.ok(fs.existsSync(script))
      const loaded = require(script)
      assert.equal(loaded.friendlyName, 'another')
      await expectFailure(runMigrations(), (e: Error) => assert.equal(e.message, 'Not implemented'))
    })

    it('with another template', async function () {
      fs.writeFileSync(path.join(workspace, 'custom.js'), `
      module.exports = { run() { throw new Error('Is custom') }}
      `, 'UTF-8')

      await run(`node bin/migsi create --config=${configFile} --name=third --template=custom`)
      const script = path.join(workspace, 'third.migsi.js')
      assert.ok(fs.existsSync(script))
      await expectFailure(runMigrations(), (e: Error) => assert.equal(e.message, 'Is custom'))
    })
  })

  describe('run', function () {
    describe('confirmation', function () {
      // since there often is no TTY for the tests, the confirmation tests are omitted for the time being
    })

    beforeEach(function () {
      createMigration('a', {inDevelopment: false})
      createMigration('b', {inDevelopment: true, dependencies: ['a']})
    })

    it('is able to run all scripts', async function () {
      await run(`node bin/migsi run --config=${configFile} --yes`)
      assertMigrations(['a', 'b'])
    })

    it('is able to run production scripts', async function () {
      await run(`node bin/migsi run --config=${configFile} --production --yes`)
      assertMigrations(['a'])
    })

    it('supports dry-run', async function () {
      await run(`node bin/migsi run --config=${configFile} --production --yes --dry-run`)
      assertMigrations([])
    })

  })

  describe('list', function () {
    it('lists migrations in order along with their run dates, when relevant', async function () {
      createMigration('script1')
      createMigration('script2', {dependencies: ['script1']})
      await runMigrations()
      createMigration('newscript')
      const {stdout} = await run(`MIGSI_QUIET= node bin/migsi list --config=${configFile}`)
      const lines = stdout.split('\n')
      const hasDate = /20\d\d/
      assert.ok(lines[0].includes('script1'))
      assert.ok(hasDate.test(lines[0]))
      assert.ok(lines[1].includes('script2'))
      assert.ok(hasDate.test(lines[1]))
      assert.ok(lines[2].includes('newscript'))
      assert.ok(lines[2].includes('to-be-run'))
    })
  })

  describe('ensure-no-development-scripts', function () {
    it('passes if there are no development scripts', async function () {
      createMigration('a', {inDevelopment: false})
      await run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`)
    })

    it('fails if there are development scripts', async function () {
      createMigration('a', {inDevelopment: true})
      await expectFailure(run(`node bin/migsi ensure-no-development-scripts --config=${configFile}`))
    })
  })

  describe('output', function () {
    describe('data', function () {
      it('is able to display stdout', async function () {
        createMigration('s1', {run: () => console.log('hello from within')})
        await runMigrations()
        const {stdout} = await run(`node bin/migsi output --config=${configFile}`)
        assert.ok(stdout.split('\n').some(line => line.includes('stdout') && line.includes('hello from within')))
      })

      it('is able to display stderr', async function () {
        createMigration('s1', {run: () => console.error('error from within')})
        await runMigrations()
        const {stdout} = await run(`node bin/migsi output --config=${configFile}`)
        assert.ok(stdout.split('\n').some(line => line.includes('stderr') && line.includes('error from within')))
      })

      it('is able to display exceptions', async function () {
        createMigration('s1', {
          run: () => {
            throw new Error('This migration failed')
          }
        })
        await expectFailure(runMigrations())
        const {stdout} = await run(`node bin/migsi output --config=${configFile}`)
        assert.ok(stdout.split('\n').some(line => line.includes('This migration failed')))
      })

      it('raw', async function () {
        createMigration('s1', {run: () => console.log('hello from within')})
        await runMigrations()
        const {stdout} = await run(`node bin/migsi output --config=${configFile} --raw`)
        assert.ok(stdout.split('\n').includes('hello from within'))
      })
    })

    describe('filtering', function () {
      it('by name', async function () {
        createMigration('s1', {run: () => console.log('s1 says hi')})
        createMigration('s2', {run: () => console.log('s2 says hi')})
        await runMigrations()
        const {stdout} = await run(`node bin/migsi output --config=${configFile} --name=s1`)
        const lines = stdout.split('\n')
        assert.ok(lines.some(line => line.includes('stdout') && line.includes('s1 says hi')))
        assert.ok(!lines.some(line => line.includes('stdout') && line.includes('s2 says hi')))
      })

      it('failed', async function () {
        createMigration('s1', {run: () => console.log('s1 says hi')})
        createMigration('s2', {
          run: () => {
            throw new Error('s2 says fail')
          }, dependencies: ['s1']
        })
        await expectFailure(runMigrations())
        const {stdout} = await run(`node bin/migsi output --config=${configFile} --failed`)
        const lines = stdout.split('\n')
        assert.ok(!lines.some(line => line.includes('s1 says hi')))
        assert.ok(lines.some(line => line.includes('s2 says fail')))
      })

      describe('durations', function () {
        beforeEach(async function () {
          interface CustomizedMigration extends Migration {
            desiredRunDate?: Date
          }

          for (let i = 1; i < 16; i += 2) {
            const desiredRunDate = moment().subtract(Math.pow(2, i), 'hours').toDate()
            createMigration('m' + i, {
              desiredRunDate, i, run: function () {
                console.log('I am', this.i)
              }
            })
          }
          createMigration('mnow', {
            run: function () {
              console.log('I am now')
            }
          })
          await runMigrations()
          if (!config.storage) throw new Error('Missing storage')
          for (let past of <CustomizedMigration[]>await config.storage.loadPastMigrations()) {
            if (past.desiredRunDate) {
              past.runDate = past.desiredRunDate
              await config.storage.updateStatus(past)
            }
          }
        })

        // TODO: some of these tests can fail if the beforeeach is run before a full hour and the it after;
        // figure out a solution for that

        describe('since', function () {
          it('specific date', async function () {
            const oneWeekAgo = moment().subtract(1, 'week').toDate().toISOString()
            const {stdout} = await run(`node bin/migsi output --config=${configFile} --since=${oneWeekAgo}`)
            assertRan(stdout, 'now', 1, 3, 5, 7)
          })

          it('date with a local timestamp is accepted', async function () {
            const now = new Date()
            const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().split('T')[0]
            const {stdout} = await run(`node bin/migsi output --config=${configFile} --since=${today}`)
            const expected = _.compact([
              'now',
              new Date().getHours() >= 2 && 1,
              new Date().getHours() >= 8 && 3
            ])
            assertRan(stdout, ...expected)
          })
        })

        describe('until', function () {
          it('specific date', async function () {
            const oneWeekAgo = moment().subtract(1, 'week').toDate().toISOString()
            const {stdout} = await run(`node bin/migsi output --config=${configFile} --until=${oneWeekAgo}`)
            assertRan(stdout, 9, 11, 13, 15)
          })

          it('date with a local timestamp is accepted', async function () {
            const now = new Date()
            const yesterday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1)).toISOString().split('T')[0]
            const {stdout} = await run(`node bin/migsi output --config=${configFile} --until=${yesterday}`)
            const expected = _.compact([
              new Date().getHours() < 2 && 1,
              new Date().getHours() < 8 && 3,
              5,
              7,
              9,
              11,
              13,
              15

            ])
            assertRan(stdout, ...expected)
          })
        })
      })

      function assertRan(output: string, ...expected: ("now" | number)[]) {
        const lines = output.split('\n')
        for (let i = -1; i < 16; i += 2) {
          const j = i === -1 ? 'now' : i
          const included = lines.some(line => !!line.match(new RegExp(`I am ${j}$`)))
          if (expected.includes(j)) {
            assert.ok(included, j + ' was supposed to be included in output')
          } else {
            assert.ok(!included, j + ' was not supposed to be included in output')
          }
        }
      }
    })
  })

  function run(commandLine: string): Promise<RunOutput> {
    return new Promise((resolve, reject) => {
      cp.exec(commandLine, function (err, stdout, stderr) {
        if (err) return reject(err)
        resolve({stdout, stderr})
      })
    })
  }
})