const path = require('path'),
  fs = require('fs'),
  dependencySolver = require('dependency-solver'),
  _ = require('lodash'),
  crypto = require('crypto'),
  config = require('./config'),
  logger = require('./logger')

const isMigrationFile = /\.migsi\.js$/

const migrationBase = {
  dependencies: null,
  noImplicitDependencies: false,
  hasBeenRun: false,
  runDate: null,
}

function sortMigrations(unsorted) {
  const dependencyMap = _.fromPairs(unsorted.map(migration => [migration.migsiName, migration.dependencies.length ? migration.dependencies : ['*']]))
  const migrationMap = _.keyBy(unsorted, migration => migration.migsiName)
  if (process.env.MIGSI_PRINT_DEPENDENCY_MAP) logger.log(JSON.stringify(dependencyMap, null, 2))
  const missingDependencies = []
  for (let migration of unsorted) {
    for (let dependency of migration.dependencies)
      if (!migrationMap[dependency]) {
        missingDependencies.push(dependency)
      }
  }
  if (missingDependencies.length) {
    throw new Error('Dependencies required but not found: ' + missingDependencies.join(', '))
  }

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
        if (config.allowRerunningAllMigrations) {
          returnAllDependants(a, migrations)
        } else {
          // cannot fix, abort
          return migs
        }
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
    if (migration.toBeRun || (anyToRun && config.allowRerunningAllMigrations)) {
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
        - set the environment variable MIGSI_ALLOW_RERUNNING_ALL_MIGRATIONS to value of 1 to force it and its descendants to be rerun 
        `)
        }
        throw new Error('Invalid migration order')
      } else {
        console.warn(`Some of the dependencies of ${migration.migsiName} are to be run despite it having been run already. This is permitted as the script is still under development. If you need it run as well, please increment its version number.`)
      }
    }
  }
}

module.exports.findMigrations = async function findMigrations(dependenciesUpdated = false) {
  const pastMigrations = await config.storage.loadPastMigrations()
  const files = findAllMigrationFiles()
  const migrations = files.map(function (file) {
    const past = pastMigrations.find(migration => migration.migsiName === file.split('.migsi.js')[0])

    if (past && !past.inDevelopment && !config.allowRerunningAllMigrations) {
      return Object.assign({}, migrationBase, {hasBeenRun: true}, past, {toBeRun: false, eligibleToRun: false})
    }
    const migration = Object.assign({}, past || {}, migrationBase, loadMigration(file))
    if (past) {
      migration.versionChanged = migration.version !== past.version
      migration.hasBeenRun = past.hasBeenRun
    }
    migration.toBeRun = !past || migration.versionChanged
    migration.eligibleToRun = !past || !!past.inDevelopment || (config.allowRerunningAllMigrations && migration.toBeRun)
    return migration
  })
  for (let migration of migrations) {
    if (!migration.dependencies) migration.dependencies = []
  }
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
  const fullFilename = path.join(config.getDir('migrationDir'), migration.migsiName + '.migsi.js')
  const migrationFromDisk = exportFriendlyRequire(fullFilename)
  const d1 = migration.dependencies || [],
    d2 = migrationFromDisk.dependencies || []

  if (d2.length) {
    if (d1.length !== d2.length || _.difference(d2, d1).length > 0) {
      logger.log('Updating dependencies of', migration.migsiName)
      migration.dependencies = d2
      await config.storage.updateStatus(migration)
    }
  }
}

function loadMigration(filename) {
  const fullFilename = path.join(config.getDir('migrationDir'), filename)
  const migration = exportFriendlyRequire(fullFilename)
  migration.dependencies = _.compact(migration.dependencies || [])
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
  const contents = fs.readdirSync(path.join(config.getDir('migrationDir'), subdir))
  for (let file of contents) {
    const fullPath = path.join(config.getDir('migrationDir'), subdir, file)
    if (isMigrationFile.test(file)) {
      yield path.join(subdir, file)
    } else if (fs.statSync(fullPath).isDirectory()) {
      yield* findMigrationFilesFrom(path.join(subdir, file))
    }
  }
}

function getHash(filename) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filename, 'UTF-8'))
  return hash.digest('hex')
}

function exportFriendlyRequire(filename) {
  const module = require(filename)
  return module.default || module
}

function returnAllDependants(parent, migrations) {
  const dependencies = {}

  for (let migration of migrations) {
    if (isDependant(migration, parent)) {
      migration.eligibleToRun = true
      migration.toBeRun = true
    }
  }

  function isDependant(migration, potentialParent) {
    return getAllDependencies(migration).includes(potentialParent.migsiName)
  }

  function getAllDependencies(migration) {
    if (dependencies[migration.migsiName]) return dependencies[migration.migsiName]

    let migDeps = migration.dependencies || []
    return dependencies[migration.migsiName] = _.flatten(migDeps.concat(migDeps.map(migrationName => getAllDependencies(getMigration(migrationName)))))
  }

  function getMigration(name) {
    return migrations.find(migration => migration.migsiName === name)
  }
}