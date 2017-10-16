describe('mongo-storage-test', function () {
  const {wipeWorkspace, createMigration, runMigrations, assertMigrations, configure, expectFailure} = require('./test-utils'),
    mongoStorage = require('../src/storage/mongo'),
    {assert} = require('chai'),
    {MongoClient} = require('mongodb'),
    P = require('bluebird')

  const defaultMongoURL = 'mongodb://localhost/migsi-test'
  const mongoURL = process.env.MIGSI_MONGO_URL || defaultMongoURL
  const customCollectionName = 'anothercollection'

  let enabled = false

  describe('mongo-storage-test', function () {

    before(async function () {
      let connection
      try {
        connection = await MongoClient.connect(mongoURL)
      } catch (err) {
        console.warn(`Mongo-storage tests are disabled: failed to connect to mongo at ${mongoURL}; please provide an URL to the ` +
          'mongo you wish to use to run these tests as the environment variable MIGSI_MONGO_URL ' +
          `to override the default (${defaultMongoURL})`)
      }
      if (connection) {
        try {
          await Promise.all([
            connection.collection(customCollectionName).remove({}),
            connection.collection(mongoStorage.defaultCollectionName).remove({}),
          ])
          await P.delay(200) // another connection might not see the changes immediately, so we delay a bit here
          enabled = true
        } catch (err) {
          console.error(err.stack)
          throw new Error(err)

        } finally {
          await connection.close()
        }
      }
    })

    beforeEach(wipeWorkspace)

    it('can be given a mongo URL', function () {
      if (!enabled) return this.skip()
      configure({storage: mongoStorage(mongoURL)})
    })

    it('throws without an URL', async function () {
      await expectFailure(async function () {
        configure({storage: mongoStorage()})
      }())
    })

    it('works', async function () {
      if (!enabled) return this.skip()
      configure({storage: mongoStorage(mongoURL)})
      await createMigration('a')
      await runMigrations()
      await createMigration('b')
      await runMigrations()
      assertMigrations(['a', 'b'])
    })

    it('is possible to use another collection', async function () {
      if (!enabled) return this.skip()
      configure({storage: mongoStorage(mongoURL, customCollectionName)})
      await createMigration('a')
      await runMigrations()
      await P.delay(200) // another connection might not see the changes immediately, so we delay the assert a bit
      const db = await MongoClient.connect(mongoURL)
      try {
        assert.equal(await db.collection(customCollectionName).count({}), 1)
      } finally {
        await db.close()
      }
    })
  })

})