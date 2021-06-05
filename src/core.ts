import * as fs from 'fs'
import * as path from 'path'

import * as _ from 'lodash'

import { Config, config, findAndLoadConfig, getDir, setupConfig } from './config'
import { Migration, RunnableMigration, TemplateVariables } from './migration'
import { findMigrations } from './migration-loader'
import { archive as archiveImpl } from './migsi-status'
import { trackOutput } from './output-tracker'
import SupportManager from './support-manager'
import { getLogger } from './utils'
import { xtermColor } from './xterm-color-tty-only'

interface MigrationFilters {
  name?: string
  since?: Date
  until?: Date
  failed?: boolean
}

interface RunOptions {
  production?: boolean
  dryRun?: boolean
  skipProgressFlag?: boolean
  confirmation?: (migrations: RunnableMigration[]) => Promise<any> | any
}

export const loadAllMigrations = async function () {
  return await findMigrations()
}

export const filterMigrations = async function ({ name, since, until, failed }: MigrationFilters) {
  const migrations = await findMigrations()
  return migrations.filter((migration) => {
    if (name && migration.friendlyName !== name && migration.migsiName !== name) return false
    if (since && (!migration.hasBeenRun || asDate(migration.runDate) < since)) return false
    if (until && (!migration.hasBeenRun || asDate(migration.runDate) >= until)) return false
    if (failed && !migration.failedToRun) return false
    return true
  })
}

export const createMigrationScript = async function (friendlyName: string, templateName = 'default') {
  const migPath = friendlyName.split('/')
  const plainName = _.last(migPath)
  const relativePath = migPath.slice(0, -1)
  const filename = (await getFilenamePrefix()) + toFilename(<string>plainName) + '.migsi.js'
  const templateImpl = loadTemplate(templateName)
  const updatedTemplate = await updateTemplate(templateImpl, { friendlyName })
  const ffn = path.join(getDir('migrationDir'), ...relativePath, filename)

  if (fs.existsSync(ffn)) {
    throw new Error(ffn + ' already exists')
  }
  ensureDirExists(path.dirname(ffn))
  fs.writeFileSync(ffn, updatedTemplate, 'UTF-8')
  return ffn
}

function ensureDirExists(path: string) {
  if (!fs.existsSync(path)) {
    ensureDirExists(getParent(path))
    fs.mkdirSync(path)
  }

  function getParent(path: string) {
    return path.split(/[/\\]/g).slice(0, -1).join(require('path').sep)
  }
}

async function getFilenamePrefix() {
  if (config.prefixAlgorithm) return await config.prefixAlgorithm()
  return getFilenameTimestamp() + '-'
}

function getFilenameTimestamp() {
  const now = new Date()
  return (
    pad(now.getFullYear(), 4) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    'T' +
    pad(now.getHours()) +
    pad(now.getMinutes())
  )

  function pad(input: number, to = 2) {
    const str = input.toString()
    if (str.length >= to) return str
    return ('0000' + str).substr(-to)
  }
}

function toFilename(raw: string) {
  const invalidChars = /[^A-Za-z0-9-_]+/g
  return raw.replace(invalidChars, '_')
}

function loadTemplate(template: string) {
  const templateFn = findTemplate(template)
  return fs.readFileSync(templateFn, 'UTF-8')
}

function findTemplate(templateName: string) {
  const templateDir = getDir('templateDir')
  const candidates = _.compact([
    templateDir && path.join(templateDir, templateName + '.template.js'),
    templateDir && path.join(templateDir, templateName + '.template.ts'),
    templateDir && path.join(templateDir, templateName + '.js'),
    templateDir && path.join(templateDir, templateName + '.ts'),
    path.join(__dirname, '..', 'templates', templateName + '.js'),
    path.join(__dirname, '..', 'templates', templateName + '.ts'),
  ])
  for (let candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Template not found: ' + templateName)
}

async function updateTemplate(rawTemplate: string, variables: TemplateVariables) {
  const implicitDependencies =
    '[' +
    (await getImplicitDependencyNames()).map((dependency) => "'" + dependency.replace(/'/g, '\\') + "'").join(', ') +
    ']'
  return rawTemplate
    .replace(/\[\[FRIENDLY_NAME\]\]/g, variables.friendlyName)
    .replace(/\[\[IMPLICIT_DEPENDENCY\]\]/g, await getImplicitDependencyName())
    .replace(/'\[\[IMPLICIT_DEPENDENCIES\]\]'/g, implicitDependencies)
    .replace(/\n?.+\/\/.+migsi-template-exclude-line/g, '')
}

export const runMigrations = async function ({
  production,
  confirmation,
  dryRun = false,
  skipProgressFlag,
}: RunOptions = {}) {
  const logger = getLogger()
  if (!config.storage) throw new Error('No storage set up')
  let migrations = await loadAllMigrations()
  if (production) {
    const firstNonProduction = migrations.find((migr) => migr.inDevelopment)
    if (firstNonProduction) {
      const index = migrations.indexOf(firstNonProduction)
      const excluded = migrations.slice(index)
      const excludedDev = excluded.filter((mig) => mig.inDevelopment)
      if (config.failOnDevelopmentScriptsInProductionMode) {
        throw new Error(
          `There are development scripts present for production usage; will not run any migrations.\n\nThe scrips marked for development are ${excludedDev.map(
            (mig) => mig.migsiName
          )}`
        )
      }
      migrations = migrations.slice(0, index)
      logger.info(
        `Excluding development mode migration scripts:\n${excludedDev.map((mig) => mig.migsiName).join('\n')}`
      )
      const excludedProd = excluded.filter((mig) => !mig.inDevelopment)
      logger.info(
        `Excluding production mode migration scripts dependant on development scripts:\n${excludedProd
          .map((mig) => mig.migsiName)
          .join('\n')}`
      )
    }
  }

  const toBeRun: RunnableMigration[] = <RunnableMigration[]>migrations.filter((m) => m.toBeRun)

  if (!toBeRun.length) {
    logger.info('No migrations to be run.')
    return toBeRun
  }

  logger.info(`Migrations to be run:\n${toBeRun.map((mig) => mig.migsiName).join('\n')}`)
  if (!(await confirmMigrations(toBeRun))) return toBeRun

  const supportManager = new SupportManager(toBeRun)

  let rollbackable = []

  for (let migration of toBeRun) {
    const before = new Date()
    migration.output = {}
    try {
      logger.info(xtermColor(33)('Running:'), migration.migsiName)
      const supportObjs = await supportManager.prepare(migration)
      if (migration.rollback) {
        rollbackable.push(migration)
      } else {
        rollbackable = []
      }
      if (!migration.archived) {
        if (!dryRun) {
          await trackOutput(migration, 'run', () => migration.run(...supportObjs))
        }
      } else {
        logger.info('Skipping migration as it has been archived')
      }
      const after = new Date(),
        durationMsec = after.valueOf() - before.valueOf()
      const duration = Math.floor(durationMsec / 100) / 10 + ' s'
      logger.info(xtermColor(40)('Success:'), migration.migsiName + ', duration ' + duration)
      migration.toBeRun = false
      migration.hasBeenRun = true
      migration.hasActuallyBeenRun = !migration.archived
      migration.failedToRun = false
      migration.rolledBack = false
      migration.eligibleToRun = !!migration.inDevelopment
      migration.runDate = new Date()
      if (!dryRun) {
        if (skipProgressFlag) {
          migration.hasBeenRun = false
        }
        await config.storage.updateStatus(migration)
      }

      await supportManager.finish()
    } catch (err) {
      migration.failedToRun = true
      migration.runDate = null
      migration.hasBeenRun = false
      migration.hasActuallyBeenRun = false
      migration.output.exception = exceptionToOutput(err)
      if (!dryRun) {
        await config.storage.updateStatus(migration)
      }
      await supportManager.destroy()
      logger.info(xtermColor(9)('Failure: ' + migration.migsiName, err.stack || err))
      err.printed = true
      if (!dryRun) {
        // support functionality failed, we do not want to be rolling back anything because of it
        await rollback(rollbackable, toBeRun)
      }
      throw err
    }
  }
  return toBeRun

  async function rollback(rollbackable: RunnableMigration[], toBeRun: RunnableMigration[]) {
    if (!config.storage) throw new Error('Storage not set up')
    if (!rollbackable.length) {
      logger.info('Rollback is not supported by the failed migration script.')
      return
    }
    const rollbackAll = config.rollbackAll
    if (rollbackAll && toBeRun[rollbackable.length - 1] !== rollbackable[rollbackable.length - 1]) {
      logger.warn(
        'Not all run migration scripts support rollback; only rolling back the last ' +
          rollbackable.length +
          ' migration scripts'
      )
    }
    const toRollback = rollbackAll ? _.reverse(rollbackable) : [<RunnableMigration>_.last(rollbackable)]

    const supportManager = new SupportManager(toRollback)

    for (let migration of toRollback) {
      const before = new Date()
      try {
        logger.info(xtermColor(33)('Rolling back:'), migration.migsiName)
        const supportObjs = await supportManager.prepare(migration)
        migration.toBeRun = true
        migration.eligibleToRun = true
        migration.rolledBack = true
        migration.runDate = null
        migration.hasBeenRun = false
        migration.hasActuallyBeenRun = false
        if (migration.failedToRun) await config.storage.updateStatus(migration)
        await trackOutput(migration, 'rollback', () => migration.rollback!(...supportObjs))
        await config.storage.updateStatus(migration)
        const after = new Date(),
          durationMsec = after.valueOf() - before.valueOf()
        const duration = Math.floor(durationMsec / 100) / 10 + ' s'
        logger.info(xtermColor(40)('Rollback success:'), migration.migsiName + ', duration ' + duration)

        await supportManager.finish()
      } catch (err) {
        if (!migration.output) migration.output = {}
        migration.output.rollbackException = exceptionToOutput(err)
        await config.storage.updateStatus(migration)
        await supportManager.destroy()
        logger.info(xtermColor(9)('Failure to rollback: ' + migration.migsiName, err.stack || err))
        err.printed = true
        throw err
      }
    }
  }

  async function confirmMigrations(toBeRun: RunnableMigration[]) {
    let confirmResponse
    if (confirmation) {
      if (!(confirmResponse = await confirmation(toBeRun))) {
        return false
      }
    }
    if (config.confirmation) {
      if (!(await config.confirmation(toBeRun, confirmResponse))) {
        return false
      }
    }

    return true
  }
}

function exceptionToOutput(err: Error) {
  return {
    message: err.message,
    stack: (err.stack || '').toString(),
  }
}

export const createTemplate = async function (name: string) {
  const dir = getDir('templateDir')
  if (!dir) throw new Error('You do not have a templateDir in your config')
  const filename = path.join(dir, `${toFilename(name)}.template.js`)
  if (fs.existsSync(filename)) throw new Error(filename + ' already exists')
  const defaultTemplateContents = fs.readFileSync(path.join(__dirname, '..', 'templates', 'default.js'), 'UTF-8')
  const newTemplateContents = defaultTemplateContents.replace(/\[\[TEMPLATE_NAME]]/g, name.replace(/'/g, "\\'"))
  fs.writeFileSync(filename, newTemplateContents, 'UTF-8')
  return filename
}

async function getImplicitDependencyName() {
  const migrations = await findMigrations()
  if (!migrations.length) return ''
  return migrations[migrations.length - 1].migsiName
}

async function getImplicitDependencyNames() {
  const migrations = await findMigrations()
  const dependencies = ([] as string[]).concat(...migrations.map((m) => m.dependencies))
  return migrations
    .filter((migration) => !dependencies.includes(migration.migsiName))
    .map((migration) => migration.migsiName)
}

export async function archive(migration: Migration) {
  return await archiveImpl(migration)
}

export const configure = function (configData: Config | string | undefined, modifications?: Partial<Config>) {
  if (typeof configData === 'string') {
    const configuration = require(configData)
    const actualConfig = { ...(configuration.default || configuration), ...(modifications || {}) }
    setupConfig(actualConfig)
  } else if (_.isObject(configData)) {
    setupConfig(<Config>configData)
  } else {
    findAndLoadConfig()
  }
}

function asDate(dateRepr: Date | string | null): Date {
  if (!dateRepr) throw new Error('Internal error: date expected')
  if (dateRepr instanceof Date) {
    return dateRepr
  }
  return new Date(dateRepr)
}
