const {MongoClient} = require('mongodb'),
  _ = require('lodash')

const api = {
  loadPastMigrations,
  updateStatus
}

const defaultCollectionName = 'migsimigrations'

module.exports = function(mongoURL, collection = defaultCollectionName) {
  if (!mongoURL) throw new Error('mongo storage must be given a mongo URL to connect to')
  return Object.assign({}, api, {
    mongoURL,
    collection
  })
}

module.exports.defaultCollectionName = defaultCollectionName

function loadPastMigrations() {
  const that = this
  return withConnection(this.mongoURL, async function(db) {
    const collection = db.collection(that.collection)
    return await collection.find({}).sort({ runDate: 1 }).toArray()
  })
}

async function withConnection(mongoURL, handler) {
  const db = await MongoClient.connect(mongoURL)
  try {
    return await handler(db)
  } finally {
    await db.close()
  }
}

async function updateStatus(migration) {
  const that = this
  withConnection(this.mongoURL, async function(db) {
    const collection = db.collection(that.collection)
    const toSet = _.omit(_.omitBy(migration, entry => _.isFunction(entry)), 'toBeRun', 'eligibleToRun')
    await collection.updateOne({ migsiName: migration.migsiName}, {$set: toSet}, {upsert: true})
  })
}
