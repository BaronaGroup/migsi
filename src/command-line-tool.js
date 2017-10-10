
const core = require('./core'),
  nodeGetoptLong = require('node-getopt-long'),
  P = require('bluebird'),
  config = require('./config'),
  readline = require('readline')

const commands = {
  'list': list(),
  'create': create(),
  'run': run(),
  'ensure-no-development-scripts': ensureNoDevelopmentScripts()
}

P.try(async function () {
  const cmdLine = parseCommandLine()
  if (cmdLine.options.config) {
    config.setupConfig(require(cmdLine.options.config))
  } else {
    config.findAndLoadConfig()
  }
  await cmdLine.command.action(cmdLine.options)
}).catch(err => {
  if (!err.printed) {
    console.error(err.stack || err)
  }
  process.exit(1)
})

function parseCommandLine() {
  const command = process.argv[2]
  process.argv.splice(2, 1)
  let cmdImpl = commands[command]
  if (!cmdImpl) throw new Error('Invalid command: ' + command + '; available commands are ' + Object.keys(commands).join(', '))

  const defaultOptions = [[
    'config|conf|c=s', 'Configuration file'
  ]]

  const options = nodeGetoptLong.options((cmdImpl.options || []).concat(defaultOptions), {
    name: 'migsi'
  })

  return {
    command: cmdImpl,
    options
  }
}

function list() {
  return {
    options: [],
    action: async function (options) {
      const migrations = await core.loadAllMigrations()
      for (let migration of migrations) {
        console.log(migration.migsiName, migration.inDevelopment ? 'dev ' : 'prod', migration.runDate || 'to-be-run')
      }
    }
  }
}

function create() {
  return {
    options: [
      ['friendlyName|n=s', 'Friendly name for migration script'],
      ['template|t=s', 'Template name']
    ],
    async action({friendlyName, template = 'default'}) {
      if (!friendlyName) {
        friendlyName = await query('Friendly name')
      }
      const filename = await core.createMigrationScript(friendlyName, template)
      console.log('Migration script created: ' + filename)
    }
  }
}

function run() {
  return {
    options: [
      ['production|prod|p', 'Only run production scripts']
    ],
    action({production = false}) {
      return core.runMigrations(production)
    }
  }
}

function ensureNoDevelopmentScripts() {
  return {
    async action() {
      const migrations = await core.loadAllMigrations()
      if (migrations.any(mig => mig.inDevelopment)) {
        throw new Error('There are migration scripts still in develoment.')
      }
    }
  }
}

async function query(prompt) {
  const readlineImpl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  try {
    return await new Promise(resolve => readlineImpl.question(prompt + ': ', resolve))
  } finally {
    readlineImpl.close()
  }
}
