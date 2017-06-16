const {MongoClient} = require('mongodb'),
  _ = require('lodash')

const api = {
  loadPastMigrations,
  flagComplete,
  updateDependencies
}

module.exports = function(mongoURL, collection = 'migsimigrations') {
  return Object.assign(api, {
    mongoURL,
    collection
  })
}

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

async function flagComplete(migration) {
  const that = this
  withConnection(this.mongoURL, async function(db) {
    const collection = db.collection(that.collection)
    const toSet = _.omit(_.omitBy(migration, entry => _.isFunction(entry)), 'hasBeenRun', 'toBeRun', 'eligibleToRun')
    await collection.updateOne({ migsiName: migration.migsiName}, {$set: toSet}, {upsert: true})
  })
}

async function updateDependencies(migsiName, dependencies) {
  const that = this
  withConnection(this.mongoURL, async function(db) {
    const collection = db.collection(that.collection)
    await collection.updateOne({ migsiName: migsiName}, {$set: {dependencies}})
  })
}