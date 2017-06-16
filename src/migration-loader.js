const path = require('path'),
  fs = require('fs'),
  dependencySolver = require('dependency-solver'),
  _ = require('lodash'),
  crypto = require('crypto'),
  config = require('./config')

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
  // NOTE: we might need a different solution to solve the case where a completed and an unrun migration depend on the same one -- they might end up in an incorrect order
  // perhaps we should add implicit dependencies from the parallel lies
  console.log(dependencyMap)
  const solved = dependencySolver.solve(dependencyMap)
  console.log(solved)
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

module.exports.findMigrations = async function findMigrations(dependenciesUpdated = false) {
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
      migration.dependencies = d2
      await config.storage.updateStatus(migration)
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

function getHash(filename) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filename, 'UTF-8'))
  return hash.digest('hex')
}