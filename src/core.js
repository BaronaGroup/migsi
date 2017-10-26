const path = require('path'),
  fs = require('fs'),
  cliColor = require('cli-color'),
  config = require('./config'),
  {findMigrations} = require('./migration-loader'),
  _ = require('lodash'),
  SupportManager = require('./support-manager'),
  logger = require('./logger'),
  {trackOutput} = require('./output-tracker')

const loadAllMigrations = exports.loadAllMigrations = async function () {
  return await findMigrations()
}

exports.filterMigrations = async function({name, since, until, failed}) {
  const migrations = await findMigrations()
  return migrations.filter(migration => {
    if (name && migration.friendlyName !== name && migration.migsiName !== name) return false
    if (since && (!migration.hasBeenRun || new Date(migration.runDate) < since)) return false
    if (until && (!migration.hasBeenRun || new Date(migration.runDate) >= until)) return false
    if (failed && !migration.failedToRun) return false
    return true
  })
}

exports.createMigrationScript = async function (friendlyName, templateName = 'default') {
  const migPath = friendlyName.split('/')
  const plainName = _.last(migPath)
  const relativePath = migPath.slice(0, -1)
  const filename = (await getFilenamePrefix()) + toFilename(plainName) + '.migsi.js'
  const templateImpl = loadTemplate(templateName)
  const updatedTemplate = await updateTemplate(templateImpl, {friendlyName})
  const ffn = path.join(config.getDir('migrationDir'), ...relativePath, filename)

  if (fs.existsSync(ffn)) {
    throw new Error(ffn + 'already exists')
  }
  ensureDirExists(path.dirname(ffn))
  fs.writeFileSync(ffn, updatedTemplate, 'UTF-8')
  return ffn
}

function ensureDirExists(path) {
  if (!fs.existsSync(path)) {
    ensureDirExists(getParent(path))
    fs.mkdirSync(path)
  }

  function getParent(path) {
    return path.split(/[/\\]/g).slice(0, -1).join(require('path').sep)
  }
}

async function getFilenamePrefix(opts) {
  if (config.prefixAlgorithm) return await config.prefixAlgorithm(opts)
  return getFilenameTimestamp() + '-'
}

function getFilenameTimestamp() {
  const now = new Date()
  return pad(now.getFullYear(), 4) + pad(now.getMonth() + 1) + pad(now.getDate()) + 'T' + pad(now.getHours() + pad(now.getMinutes()))

  function pad(input, to = 2) {
    const str = input.toString()
    if (str.length >= to) return str
    return ('0000' + str).substr(-to)
  }
}

function toFilename(raw) {
  const invalidChars = /[^A-Za-z0-9-_]+/g
  return raw.replace(invalidChars, '_')
}

function loadTemplate(template) {
  const templateFn = findTemplate(template)
  return fs.readFileSync(templateFn, 'UTF-8')
}

function findTemplate(templateName) {
  const templateDir = config.getDir('templateDir')
  const candidates = _.compact([
    templateDir && path.join(templateDir, templateName + '.template.js'),
    templateDir && path.join(templateDir, templateName + '.js'),
    path.join(__dirname, '..', 'templates', templateName + '.js')
  ])
  for (let candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Template not found: ' + templateName)
}

async function updateTemplate(rawTemplate, variables) {
  return rawTemplate.replace(/\[\[FRIENDLY_NAME\]\]/g, variables.friendlyName)
    .replace(/\[\[IMPLICIT_DEPENDENCY\]\]/g, await getImplicitDependencyName())
    .replace(/\n?.+\/\/.+migsi-template-exclude-line/g, '')
}

exports.runMigrations = async function({production, confirmation, dryRun = false} = {}) {
  let migrations = await loadAllMigrations()
  if (production) {
    const firstNonProduction = migrations.find(migr => migr.inDevelopment)
    if (firstNonProduction) {
      const index = migrations.indexOf(firstNonProduction)
      const excluded = migrations.slice(index)
      const excludedDev = excluded.filter(mig => mig.inDevelopment)
      if (config.failOnDevelopmentScriptsInProductionMode) {
        throw new Error(`There are development scripts present for production usage; will not run any migrations.\n\nThe scrips marked for development are ${excludedDev.map(mig => mig.migsiName)}`)
      }
      migrations = migrations.slice(0, index)
      logger.log(`Excluding development mode migration scripts:\n${excludedDev.map(mig => mig.migsiName).join('\n')}`)
      const excludedProd = excluded.filter(mig => mig.production)
      logger.log(`Excluding production mode migration scripts dependant on development scripts:\n${excludedProd.map(mig => mig.migsiName).join('\n')}`)
    }
  }

  const toBeRun = migrations.filter(m => m.toBeRun)

  if (!toBeRun.length) {
    logger.log('No migrations to be run.')
    return
  }

  logger.log(`Migrations to be run:\n${toBeRun.map(mig => mig.migsiName).join('\n')}`)
  if (!await confirmMigrations(toBeRun)) return

  const supportManager = new SupportManager(toBeRun)

  let rollbackable = []

  for (let migration of toBeRun) {
    const before = new Date()
    try {
      logger.write(cliColor.xterm(33)('Running: '))
      logger.log(migration.migsiName)
      const supportObjs = await supportManager.prepare(migration)
      if (migration.rollback) {
        rollbackable.push(migration)
      } else {
        rollbackable = []
      }
      migration.output = {}
      if (!dryRun) {
        await trackOutput(migration, 'run', () => migration.run(...supportObjs))
      }
      const after = new Date(),
        durationMsec = after.valueOf() - before.valueOf()
      const duration = Math.floor(durationMsec / 100) / 10 + ' s'
      logger.write(cliColor.xterm(40)('Success: '))
      logger.log(migration.migsiName + ', duration ' + duration)
      migration.toBeRun = false
      migration.hasBeenRun = true
      migration.failedToRun = false
      migration.rolledBack = false
      migration.eligibleToRun = !!migration.inDevelopment
      migration.runDate = new Date()
      if (!dryRun) {
        await config.storage.updateStatus(migration)
      }

      await supportManager.finish(migration)
    } catch (err) {
      migration.failedToRun = true
      migration.runDate = null
      migration.hasBeenRun = false
      migration.output.exception = exceptionToOutput(err)
      if (!dryRun) {
        await config.storage.updateStatus(migration)
      }
      await supportManager.destroy()
      logger.log(cliColor.xterm(9)('Failure: ' + migration.migsiName, err.stack || err))
      err.printed = true
      if (!dryRun) { // support functionality failed, we do not want to be rolling back anything because of it
        await rollback(rollbackable, toBeRun)
      }
      throw err
    }
  }
  return toBeRun

  async function rollback(rollbackable, toBeRun) {
    if (!rollbackable.length) {
      logger.log('Rollback is not supported by the failed migration script.')
      return
    }
    const rollbackAll = config.rollbackAll
    if (rollbackAll && toBeRun[rollbackable.length - 1] !== rollbackable[rollbackable.length - 1]) {
      logger.warn('Not all run migration scripts support rollback; only rolling back the last ' + rollbackable.length + ' migration scripts')
    }
    const toRollback = rollbackAll ? _.reverse(rollbackable) : [_.last(rollbackable)]

    const supportManager = new SupportManager(toRollback)

    for (let migration of toRollback) {
      const before = new Date()
      try {
        logger.write(cliColor.xterm(33)('Rolling back: '))
        logger.log(migration.migsiName)
        const supportObjs = await supportManager.prepare(migration)
        migration.toBeRun = true
        migration.eligibleToRun = true
        migration.rolledBack = true
        migration.runDate = null
        migration.hasBeenRun = false
        if (migration.failedToRun) await config.storage.updateStatus(migration)
        await trackOutput(migration, 'rollback', () => migration.rollback(...supportObjs))
        await config.storage.updateStatus(migration)
        const after = new Date(),
          durationMsec = after.valueOf() - before.valueOf()
        const duration = Math.floor(durationMsec / 100) / 10 + ' s'
        logger.write(cliColor.xterm(40)('Rollback success: '))
        logger.log(migration.migsiName + ', duration ' + duration)

        await supportManager.finish(migration)

      } catch (err) {
        migration.output.rollbackException = exceptionToOutput(err)
        await config.storage.updateStatus(migration)
        await supportManager.destroy()
        logger.log(cliColor.xterm(9)('Failure to rollback: ' + migration.migsiName, err.stack || err))
        err.printed = true
        throw err
      }
    }

  }

  async function confirmMigrations(toBeRun) {
    let confirmResponse
    if (confirmation) {
      if (!(confirmResponse = await confirmation(toBeRun))) {
        return false
      }
    }
    if (config.confirmation) {
      if (!await config.confirmation(toBeRun, confirmResponse)) {
        return false
      }
    }

    return true
  }
}

function exceptionToOutput(err) {
  return {
    message: err.message,
    stack: (err.stack || '').toString()
  }
}

exports.createTemplate = async function (name) {
  const dir = config.getDir('templateDir')
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
  return (_.last(migrations) || {}).migsiName || ''
}

exports.configure = function (configData) {
  if (_.isString(configData)) {
    const configuration = require(configData)
    config.setupConfig(configuration.default || configuration)
  } else if (_.isObject(configData)) {
    config.setupConfig(configData)
  } else {
    config.findAndLoadConfig()
  }
}