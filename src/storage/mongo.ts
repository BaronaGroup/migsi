import {MongoClient, Db} from 'mongodb'
import * as _ from 'lodash'

const api = {
  loadPastMigrations,
  updateStatus
}

export const defaultCollectionName = 'migsimigrations'

export default function(mongoURL : string, collection = defaultCollectionName) {
  if (!mongoURL) throw new Error('mongo storage must be given a mongo URL to connect to')
  return Object.assign({}, api, {
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

async function withConnection(mongoURL : string, handler : (mongo : Db) => Promise<any>) {
  const db = await MongoClient.connect(mongoURL)
  try {
    return await handler(db)
  } finally {
    await db.close()
  }
}

async function updateStatus(migration : Migration) {
  const that = this
  await withConnection(this.mongoURL, async function(db) {
    const collection = db.collection(that.collection)
    const toSet = _.omit(_.omitBy(migration, entry => _.isFunction(entry)), 'toBeRun', 'eligibleToRun')
    await collection.updateOne({ migsiName: migration.migsiName}, {$set: toSet}, {upsert: true})
  })
}
