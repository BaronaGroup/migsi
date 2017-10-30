
module.exports = function(moduleName) {
  var majorVersion = parseInt((process.version.match(/^v(\d+)/) || [])[1])

  if (majorVersion >= 8) {
    return extractDefault(require('./es2017/' + moduleName))
  } else {
    return extractDefault(require('./es2016/' + moduleName))
  }
}

function extractDefault(lib) {
  if (lib && lib.default) {
    return Object.assign(lib.default, lib) // this is quite terrible, really
  }
  return lib
}