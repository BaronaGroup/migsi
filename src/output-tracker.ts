import { Writable } from 'stream'

import * as _ from 'lodash'

import { config } from './config'
import { Migration, OutputLine } from './migration'

type Context = 'run' | 'rollback'
type StreamName = 'stdout' | 'stderr'

interface OutputBase {
  stdout: OutputLine[]
  stderr: OutputLine[]
}

export const trackOutput = async function (migration: Migration, runType: Context, run: () => Promise<any>) {
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

  const output: OutputBase = {
    stdout: [],
    stderr: [],
  }

  ;(<any>process.stdout).write = customWrite('stdout', process.stdout as any as Writable, defaultStdoutWrite)
  ;(<any>process.stderr).write = customWrite('stderr', process.stderr as any as Writable, defaultStderrWrite)

  return {
    output,
    finish,
  }

  function customWrite(context: StreamName, stream: Writable, defaultImpl: any) {
    return function (chunk: any, encoding: any, callback: any) {
      output[context].push({ timestamp: new Date().valueOf(), data: chunk.toString('utf-8') })
      return defaultImpl.call(stream, chunk, encoding, callback)
    }
  }

  function finish() {
    process.stdout.write = defaultStdoutWrite
    process.stderr.write = defaultStderrWrite
  }
}

export const outputProcessor = {
  makeLinear(migration: Migration, category: Context) {
    return _.sortBy(
      [
        ..._.get(migration, ['output', category, 'stdout'], []).map(({ timestamp, data }: OutputLine) => ({
          timestamp,
          data,
          stream: 'stdout',
        })),
        ..._.get(migration, ['output', category, 'stderr'], []).map(({ timestamp, data }: OutputLine) => ({
          timestamp,
          data,
          stream: 'stderr',
        })),
      ],
      'timestamp'
    )
  },
}
