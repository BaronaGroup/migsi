import {wipeWorkspace, runMigrations, configure} from './test-utils'
import {assert as chaiAssert} from 'chai'
import {MongoClient, Db} from 'mongodb'
import {delay} from '../src/utils'
import * as fs from 'fs'
import * as path from 'path'
import logger from '../src/default-logger'

const assert = chaiAssert // doing this so that other references to assert don't fail

describe('mongo-storage-test', function () {

  const defaultMongoURL = 'mongodb://localhost/migsi-test'
  const mongoURL = process.env.MIGSI_MONGO_URL || defaultMongoURL
  const collectionName = 'testCollection'

  let enabled = false

  describe('using-mongo-test', function () {

    before(async function () {
      let connection
      try {
        connection = await MongoClient.connect(mongoURL)
      } catch (err) {
        logger.warn(`Mongo-storage tests are disabled: failed to connect to mongo at ${mongoURL}; please provide an URL to the ` +
          'mongo you wish to use to run these tests as the environment variable MIGSI_MONGO_URL ' +
          `to override the default (${defaultMongoURL})`)
      }
      if (connection) {
        try {
          await Promise.all([
            connection.collection(collectionName).remove({}),
          ])
          await delay(200) // another connection might not see the changes immediately, so we delay a bit here
          enabled = true
        } catch (err) {
          logger.error(err.stack)
          throw new Error(err)

        } finally {
          await connection.close()
        }
      }
      configure({
        using: {
          mongodb: require('../src/using/mongodb')(mongoURL)
        }
      })
    })

    beforeEach(wipeWorkspace)

    it('works', async function () {
      if (!enabled) return this.skip()

      async function run(mongodb : Db, collectionName : string) {
        const collection = mongodb.collection(collectionName)
        assert.equal(await collection.count({}), 0)
        await collection.insert({color: 'yellow'})
        assert.equal(await collection.count({}), 1)
      }

      const migrationBody = `
      const {assert} = require('chai')
      module.exports = {
        using: ['mongodb', () => '${collectionName}'],
        run: ${run.toString()}
      }       
      `

      fs.writeFileSync(path.join(__dirname, '..', 'test-workspace', 'migration.migsi.js'), migrationBody, 'UTF-8')
      await runMigrations()

      const conn = await MongoClient.connect(mongoURL)
      assert.equal(await conn.collection(collectionName).count({}), 1)
      await conn.close()
    })
  })
})