const fs = require('fs'),
  path = require('path')

exports.setupConfig = config => Object.assign(exports, config)

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
