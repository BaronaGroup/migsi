const path = require('path'),
  fs = require('fs'),
  cliColor = require('cli-color'),
  config = require('./config'),
  {findMigrations} = require('./migration-loader'),
  _ = require('lodash'),
  SupportManager = require('./support-manager'),
  logger = require('./logger')

const loadAllMigrations = exports.loadAllMigrations = async function () {
  return await findMigrations()
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
  if (templateDir) {
    const candidate = path.join(templateDir, templateName + '.js')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  const candidate2 = path.join(__dirname + '/../templates', templateName + '.js')

  if (fs.existsSync(candidate2)) {
    return candidate2
  }

  throw new Error('Template not found: ' + templateName)
}

async function updateTemplate(rawTemplate, variables) {
  return rawTemplate.replace(/\[\[FRIENDLY_NAME\]\]/g, variables.friendlyName)
    .replace(/\[\[IMPLICIT_DEPENDENCY\]\]/g, await getImplicitDependencyName())
}

exports.runMigrations = async function({production, confirmation} = {}) {
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

  for (let migration of toBeRun) {
    const before = new Date()
    try {
      logger.write(cliColor.xterm(33)('Running: '))
      logger.log(migration.migsiName)
      const supportObjs = await supportManager.prepare(migration)
      await migration.run(...supportObjs)
      await supportManager.finish(migration)
      const after = new Date(),
        durationMsec = after.valueOf() - before.valueOf()
      const duration = Math.floor(durationMsec / 100) / 10 + ' s'
      logger.write(cliColor.xterm(40)('Success: '))
      logger.log(migration.migsiName + ', duration ' + duration)
      migration.toBeRun = false
      migration.hasBeenRun = true
      migration.eligibleToRun = !!migration.inDevelopment
      migration.runDate = new Date()
      await config.storage.updateStatus(migration)
    } catch(err) {
      await supportManager.destroy()
      logger.log(cliColor.xterm(9)('Failure: ' + migration.migsiName, err.stack || err))
      err.printed = true
      throw err
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


async function getImplicitDependencyName() {
  const migrations = await findMigrations()
  return (_.last(migrations) || {}).migsiName || ''
}

exports.configure = function(configData) {
  if (_.isString(configData)) {
    const configuration = require(configData)
    config.setupConfig(configuration.default || configuration)
  } else if (_.isObject(configData)) {
    config.setupConfig(configData)
  } else {
    config.findAndLoadConfig()
  }
}