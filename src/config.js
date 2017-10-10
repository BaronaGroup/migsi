const fs = require('fs'),
  path = require('path')

exports.setupConfig = config => Object.assign(exports, config, getEnvironmentConfig())

exports.findAndLoadConfig = function() {
  exports.setupConfig(findConfigPath())
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

function getEnvironmentConfig() {
  const additions = {}
  if (process.env.MIGSI_ALLOW_RERUNNING_ALL_MIGRATIONS) {
    additions.allowRerunningAllMigrations = true
  }
  return additions
}