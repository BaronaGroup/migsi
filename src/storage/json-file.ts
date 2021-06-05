import * as fs from 'fs'

import * as _ from 'lodash'

import { Storage } from '../config'
import { Migration } from '../migration'

const api = {
  loadPastMigrations,
  updateStatus,
}

export default function (filename: string) {
  if (!filename) throw new Error('Filename is required for json-storage')
  return <Storage>Object.assign({}, api, {
    filename,
  })
}

function loadPastMigrations(): Migration[] {
  if (!fs.existsSync(this.filename)) {
    return []
  }
  return JSON.parse(fs.readFileSync(this.filename, 'utf-8'))
}

async function updateStatus(migration: Migration) {
  const newEntry = <Migration>(<any>_.omit(
    _.omitBy(migration, (entry: any) => _.isFunction(entry)),
    'toBeRun',
    'eligibleToRun'
  ))
  const data: Migration[] = this.loadPastMigrations()
  const entry = data.find((entry) => entry.migsiName === migration.migsiName)
  if (!entry) {
    data.push(newEntry)
  } else {
    Object.assign(entry, newEntry)
  }
  fs.writeFileSync(this.filename, JSON.stringify(data, null, 2), 'utf-8')
}
