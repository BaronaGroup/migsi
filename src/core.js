const path = require('path'),
  fs = require('fs'),
  dependencySolver = require('dependency-solver'),
  _ = require('lodash'),
  P = require('bluebird'),
  cliColor = require('cli-color'),
  crypto = require('crypto')

let config

const isMigrationFile = /\.migsi\.js$/

const migrationBase = {
  dependencies: null,
  noImplicitDependencies: false,
  hasBeenRun: false,
  runDate: null,
}


exports.loadConfig = function () {
  const configPath = findConfigPath()
  config = require(configPath)
}

function findConfigPath(from = __dirname) {
  let rcpath = from + '/.migsirc'
  if (fs.existsSync(rcpath)) {
    return rcpath
  }
  const newPath = path.resolve(from, '..')
  if (newPath === '/') throw new Error('Could not find .migsirc')
  return findConfigPath(newPath)
}

const loadAllMigrations = exports.loadAllMigrations = async function () {
  return await findMigrations()
}

async function findMigrations(dependenciesUpdated = false) {
  const pastMigrations = await config.storage.loadPastMigrations()
  const files = findAllMigrationFiles()
  let prev
  const migrations = files.map(function (file) {
    const past = pastMigrations.find(migration => migration.migsiName === file.split('.migsi.js')[0])
    if (past && !past.inDevelopment) {
      prev = file
      return Object.assign({}, migrationBase, {hasBeenRun: true}, past)
    }
    const migration = Object.assign({}, past || {}, migrationBase, loadMigration(file, prev))
    if (past) {
      migration.versionChanged = migration.version !== past.version
      migration.hasBeenRun = past.hasBeenRun
    }
    migration.eligibleToRun = true
    migration.toBeRun = !past || migration.versionChanged
    prev = file
    return migration
  })
  try {
    const sortedMigrations = sortMigrations(migrations)
    checkMigrationOrderValidity(sortedMigrations, dependenciesUpdated)
    return sortedMigrations
  } catch(err) {
    if (!dependenciesUpdated) {
      const potentiallyOutdated = migrations.filter(mig => mig.hasBeenRun && !mig.inDevelopment)
      for (let migration of potentiallyOutdated) {
        await updateDependencies(migration)
      }
      return findMigrations(pastMigrations, true)
    } else {
      throw err
    }
  }
}

async function updateDependencies(migration) {
  const fullFilename = path.join(config.migrationDir, migration.migsiName + '.migsi.js');
  const migrationFromDisk = require(fullFilename)
  const d1 = migration.dependencies || [],
    d2 = migrationFromDisk.dependencies || []

  if (d2.length) {
    if (d1.length !== d2.length || _.difference(d2, d1).length > 0) {
      console.log('Updating dependencies of', migration.migsiName)
      await config.storage.updateDependencies(migration.migsiName, d2)
    }
  }
}

function loadMigration(filename, prev) {
  const fullFilename = path.join(config.migrationDir, filename)
  const migration = require(fullFilename)
  if (!migration.dependencies && !migration.noImplicitDependencies) {
    migration.dependencies = prev ? [prev.split('.migsi.js')[0]] : []
  }
  migration.migsiName = filename.split('.migsi.js')[0]
  if (migration.version === 'hash') {
    migration.version += ':' + getHash(fullFilename)
  }
  return migration
}

function findAllMigrationFiles() {
  return [...findMigrationFilesFrom('./')]
}

function* findMigrationFilesFrom(subdir) {
  const contents = fs.readdirSync(path.join(config.migrationDir, subdir))
  for (let file of contents) {
    const fullPath = path.join(config.migrationDir, subdir, file)
    if (isMigrationFile.test(file)) {
      yield path.join(subdir, file)
    } else if (fs.statSync(fullPath).isDirectory()) {
      yield* findMigrationFilesFrom(path.join(subdir, file))
    }
  }
}

exports.createMigrationScript = async function (friendlyName, templateName) {
  const filename = getFilenameTimestamp() + '-' + toFilename(friendlyName) + '.migsi.js'
  console.log(filename)
  const templateImpl = loadTemplate(templateName)
  const updatedTemplate = updateTemplate(templateImpl, {friendlyName})
  const ffn = path.join(config.migrationDir, filename)

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
  if (config.templateDir) {
    const candidate = path.join(config.templateDir, templateName + '.js')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  const candidate2 = path.join(__dirname + '/../templates', templateName + '.js')
  console.log(candidate2)
  if (fs.existsSync(candidate2)) {
    return candidate2
  }

  throw new Error('Template not found: ' + templateName)
}

function updateTemplate(rawTemplate, variables) {
  return rawTemplate.replace(/\[\[FRIENDLY_NAME\]\]/g, variables.friendlyName)
}

function sortMigrations(unsorted) {
  const dependencyMap = _.fromPairs(unsorted.map(migration => [migration.migsiName, migration.dependencies.length ? migration.dependencies : ['*']]))
  const migrationMap = _.keyBy(unsorted, migration => migration.migsiName)
  // NOTE: we might need a different solution to solve the case where a completed and an unrun migration depend on the same one -- they might end up in an incorrect order
  // perhaps we should add implicit dependencies from the parallel lies
  const solved = dependencySolver.solve(dependencyMap)
  const dependencySorterMigrations = _.compact(solved.filter(e => e !== '*').map(name => migrationMap[name]))
  return fixParallelDependencyOrder(dependencySorterMigrations)

}

function fixParallelDependencyOrder(migrations) {
  const migs = [].concat(migrations) // clone
  for (let i = 0; i < migs.length - 1; ++i) {
    const a = migs[i],
      b = migs[i + 1]
    if (a.toBeRun && !b.eligibleToRun) {
      if (!b.dependencies.includes(a.migsiName)) {
        migs.splice(i, 2, b, a)
      } else {
        // cannot fix, abort
        return migs
      }
    } else if (a.toBeRun && !b.toBeRun) { // b could be run, but doesn't need to be
      if (!b.dependencies.includes(a.migsiName)) { // reorder them to for ideal order
        migs.splice(i, 2, b, a)
        --i
      }
    } else if (a.inDevelopment && !b.inDevelopment) { // production scripts before development
      if (!b.dependencies.includes(a.migsiName)) { // reorder them to for ideal order
        migs.splice(i, 2, b, a)
        --i
      }
    }
  }
  return migs
}

function checkMigrationOrderValidity(migrations, dependenciesHaveBeenUpdated = false) {
  let anyToRun = false,
    potentialDependencyMigration,
    toBeRun = []
  for (let migration of migrations) {
    if (migration.toBeRun) {
      anyToRun = true
      toBeRun.push(migration.migsiName)
    } else {
      if (!anyToRun) {
        potentialDependencyMigration = migration.migsiName
      } else if (!migration.inDevelopment) {
        if (dependenciesHaveBeenUpdated) {
          console.error(`${migration.migsiName} can not be run, as it should've been run before the migrations ${toBeRun.join(', ')}, which ha(s|ve) not been run.
        
        To solve this problem, you can either:
        - add an explicit dependency to run ${migration.migsiName} before the others; usually by having ${migration.migsiName} depend on a migration script that
        has already been run (the latest one being ${potentialDependencyMigration})
        - re-create the migration script as a new one (making it the last migration to be run) 
        `)
        }
        throw new Error('Invalid migration order')
      } else {
        console.warn(`Some of the dependencies of ${migration.migsiName} are to be run despite it having been run already. This is permitted as the script is still under development. If you need it run as well, please increment its version number.`)
      }
    }
  }
}

exports.runMigrations = async function(production) {
  let migrations = await loadAllMigrations()
  if (production) {
    const firstNonProduction = migrations.find(migr => migr.inDevelopment)
    if (firstNonProduction) {
      const index = migrations.indexOf(firstNonProduction)
      const excluded = migrations.slice(index)
      const excludedDev = excluded.filter(mig => mig.inDevelopment)
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
  await confirm()
  for (let migration of toBeRun) {
    const before = new Date()
    try {
      process.stdout.write(cliColor.xterm(33)('Running: '))
      console.log(migration.migsiName)
      await migration.run()
      const after = new Date(),
        durationMsec = after.valueOf() - before.valueOf()
      const duration = Math.floor(durationMsec / 100) / 10 + ' s'
      process.stdout.write(cliColor.xterm(40)('Success: '))
      console.log(migration.migsiName + ', duration ' + duration)
      migration.toBeRun = false
      migration.hasBeenRun = true
      migration.eligibleToRun = !!migration.inDevelopment
      migration.runDate = new Date()
      config.storage.flagComplete(migration)
    } catch(err) {
      console.log(cliColor.xterm(9)('Failure: ' + migration.migsiName, err.stack || err))
      err.printed = true
      throw err
    }
  }
}

async function confirm() {
  return P.delay(500)
}

function getHash(filename) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filename, 'UTF-8'))
  return hash.digest('hex')
}