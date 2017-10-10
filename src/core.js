const path = require('path'),
  fs = require('fs'),
  P = require('bluebird'),
  cliColor = require('cli-color'),
  config = require('./config'),
  {findMigrations} = require('./migration-loader'),
  _ = require('lodash'),
  SupportManager = require('./support-manager')

const loadAllMigrations = exports.loadAllMigrations = async function () {
  return await findMigrations()
}

exports.createMigrationScript = async function (friendlyName, templateName) {
  const migPath = friendlyName.split('/')
  const plainName = _.last(migPath)
  const relativePath = migPath.slice(0, -1)
  const filename = getFilenameTimestamp() + '-' + toFilename(plainName) + '.migsi.js'
  const templateImpl = loadTemplate(templateName)
  const updatedTemplate = await updateTemplate(templateImpl, {friendlyName})
  const ffn = path.join(config.getDir('migrationDir'), ...relativePath, filename)

  if (fs.existsSync(ffn)) {
    throw new Error(ffn + 'already exists')
  }
  fs.writeFileSync(ffn, updatedTemplate, 'UTF-8')
  return ffn
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
  const templateDir = config.getDir('templateDir');
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

exports.runMigrations = async function(production, confirmed) {
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
      console.log(`Excluding development mode migration scripts:\n${excludedDev.map(mig => mig.migsiName).join('\n')}`)
      const excludedProd = excluded.filter(mig => mig.production)
      console.log(`Excluding production mode migration scripts dependant on development scripts:\n${excludedProd.map(mig => mig.migsiName).join('\n')}`)
    }
  }

  const toBeRun = migrations.filter(m => m.toBeRun)

  if (!toBeRun.length) {
    console.log('No migrations to be run.')
    return
  }

  console.log(`Migrations to be run:\n${toBeRun.map(mig => mig.migsiName).join('\n')}`)
  if (!confirmed) await confirm()

  const supportManager = new SupportManager(toBeRun)

  console.log(toBeRun.map(t => t.migsiName))
  for (let migration of toBeRun) {
    console.log(toBeRun.length)

    const before = new Date()
    try {
      process.stdout.write(cliColor.xterm(33)('Running: '))
      console.log(migration.migsiName)
      const supportObjs = await supportManager.prepare(migration)
      await migration.run(...supportObjs)
      await supportManager.finish(migration)
      const after = new Date(),
        durationMsec = after.valueOf() - before.valueOf()
      const duration = Math.floor(durationMsec / 100) / 10 + ' s'
      process.stdout.write(cliColor.xterm(40)('Success: '))
      console.log(migration.migsiName + ', duration ' + duration)
      migration.toBeRun = false
      migration.hasBeenRun = true
      migration.eligibleToRun = !!migration.inDevelopment
      migration.runDate = new Date()
      await config.storage.updateStatus(migration)
    } catch(err) {
      await supportManager.destroy()
      console.log(cliColor.xterm(9)('Failure: ' + migration.migsiName, err.stack || err))
      err.printed = true
      throw err
    }
  }
}

async function confirm() {
  return P.delay(500)
}

async function getImplicitDependencyName() {
  const migrations = await findMigrations()
  return (_.last(migrations) || {}).migsiName || ''
}

exports.configure = function(config) {
  if (_.isString(config)) {
    const configuration = require(config)
    config.setupConfig(configuration.default || configuration)
  } else if (_.isObject(config)) {
    config.setupConfig(config)
  } else {
    config.findAndLoadConfig()
  }
}