const {MongoClient} = require('mongodb'),
  _ = require('lodash'),
  fs = require('fs')

const api = {
  loadPastMigrations,
  updateStatus
}

module.exports = function(filename) {
  return Object.assign(api, {
    filename
  })
}

function loadPastMigrations() {
  if (!fs.existsSync(this.filename)) {
    return []
  }
  return JSON.parse(fs.readFileSync(this.filename), 'UTF-8')
}

async function updateStatus(migration) {
  const newEntry = _.omit(_.omitBy(migration, entry => _.isFunction(entry)), 'hasBeenRun', 'toBeRun', 'eligibleToRun')
  const data = this.loadPastMigrations()
  const entry = data.find(entry => entry.migsiName === migration.migsiName)
  if (!entry) {
    data.push(newEntry)
  } else {
    Object.assign(entry, newEntry)
  }
  fs.writeFileSync(this.filename, JSON.stringify(data, null, 2), 'UTF-8')
}

