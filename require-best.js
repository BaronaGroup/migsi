
module.exports = function(moduleName) {
  var majorVersion = parseInt((process.version.match(/^v(\d+)/) || [])[1])

  if (majorVersion >= 8) {
    return require('./src/' + moduleName)
  } else {
    return require('./node6/' + moduleName)
  }
}