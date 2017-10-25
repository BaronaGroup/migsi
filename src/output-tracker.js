const config = require('./config'),
  _ = require('lodash')

exports.trackOutput = async function(migration, runType, run) {
  if (config.disableOutputTracking) return await run()

  const tracker = enableOutputTracking()
  try {
    await run()
  } finally {
    tracker.finish()
    const output = tracker.output
    _.set(migration, ['output', runType], output)
  }
}

function enableOutputTracking() {
  const defaultStdoutWrite = process.stdout.write
  const defaultStderrWrite = process.stderr.write

  const output = {
    stdout: [],
    stderr: []
  }

  process.stdout.write = customWrite('stdout', process.stdout, defaultStdoutWrite)
  process.stderr.write = customWrite('stderr', process.stderr, defaultStderrWrite)

  return {
    output,
    finish
  }

  function customWrite(context, stream, defaultImpl) {
    return function(chunk, encoding, callback) {
      output[context].push({timestamp: new Date().valueOf(), data: chunk.toString('UTF-8')})
      return defaultImpl.call(stream, chunk, encoding, callback)
    }
  }

  function finish() {
    process.stdout.write = defaultStdoutWrite
    process.stderr.write = defaultStderrWrite
  }
}

exports.outputProcessor = {
  makeLinear(migration, category) {
    return _.sortBy([
      ..._.get(migration, ['output', category, 'stdout'], []).map(({timestamp, data}) => ({timestamp, data, stream: 'stdout'})),
      ..._.get(migration, ['output', category, 'stderr'], []).map(({timestamp, data}) => ({timestamp, data, stream: 'stderr'}))
    ], 'timestamp')
  }
}