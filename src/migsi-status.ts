import {config, getDir} from './config'
import * as fs from 'fs'
import {Stats} from 'fs'

let activeStatus: MigsiStatus | undefined

interface MigsiStatus {
  archivedMigrations: string[]
}

export async function archive(migration: Migration) {
  const status = await loadStatus()
  if (!status.archivedMigrations.includes(migration.migsiName)) {
    status.archivedMigrations.push(migration.migsiName)
  }
  await saveStatus(status)
}

export async function isArchived(migration: Migration) {
  const status = await loadStatus()
  return status.archivedMigrations.includes(migration.migsiName)
}

async function loadStatus(): Promise<MigsiStatus> {
  if (!config)
  if (activeStatus) return activeStatus
  const filename = config.migsiStatusFile && getDir('migsiStatusFile')
  const exists = filename && await new Promise<boolean>(resolve => fs.exists(filename, exists => {
    resolve(exists)
  }))

  const contents = filename && exists ? await new Promise<string>((resolve, reject) => fs.readFile(filename, 'UTF-8', (err, rawData) => {
    if (err) return reject(err)
    resolve(rawData)
  })) : '{}'

  const data = JSON.parse(contents)
  if (!data.archivedMigrations) {
    data.archivedMigrations = []
  }

  if (!(data.archivedMigrations instanceof Array)) throw new Error('Invalid migsi status file')

  return data as MigsiStatus
}

async function saveStatus(status: MigsiStatus) {
  const filename = getDir('migsiStatusFile')
  const json = JSON.stringify(status, null, 2)
  await new Promise<void>((resolve, reject) => fs.writeFile(filename, json, 'UTF-8', err => {
    if (err) return reject(err)
    resolve()
  }))
  activeStatus = status
}

export function reset() {
  activeStatus = undefined
}