
const core = require('./core'),
  nodeGetoptLong = require('node-getopt-long'),
  config = require('./config'),
  logger = require('./logger'),
  path = require('path'),
  inquirer = require('inquirer'),
  _ = require('lodash'),
  fs = require('fs')

const commands = {
  'list': list(),
  'create': create(),
  'run': run(),
  'ensure-no-development-scripts': ensureNoDevelopmentScripts()
}

async function runApp() {
  const cmdLine = parseCommandLine()
  if (cmdLine.options.config) {
    config.setupConfig(require(cmdLine.options.config))
  } else {
    config.findAndLoadConfig()
  }
  await cmdLine.command.action(cmdLine.options)
}

runApp().catch(err => {
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
        logger.log(migration.migsiName, migration.inDevelopment ? 'dev ' : 'prod', migration.runDate || 'to-be-run')
      }
    }
  }
}

function create() {
  return {
    options: [
      ['friendlyName|name|n=s', 'Friendly name for migration script'],
      ['template|t=s', 'Template name']
    ],
    async action({friendlyName, template = 'default'}) {
      if (!friendlyName) {
        return await createWizard()
      }
      const filename = await core.createMigrationScript(friendlyName, template)
      logger.log('Migration script created: ' + filename)
    }
  }
}

async function createWizard() {
    const templates = await getTemplates()

    const answers = await inquirer.prompt([
      {
        name: 'scriptName',
        message: 'Migration script name (does not have to look like a filename)',
        validate: value => !!value || 'Please enter a name for the script',
        prefix: ''
      },
      {
        name: 'template',
        message: 'Select a template for the migration script',
        type: 'list',
        choices: _.map(templates, 'name'),
        prefix: ''
      }
    ])

    const filename = await core.createMigrationScript(answers.scriptName, templates.find(item => item.name === answers.template).refName)
    logger.log('The script can be found to be edited at ' + path.relative(process.cwd(), filename))
  }

  function getTemplates() {
    const customTemplateDir = config.getDir('templateDir')
    const templates = [...getTemplatesFrom(customTemplateDir)].map(getTemplateInfo)
    if (!templates.some(item => item.rawName === 'default')) {
      templates.push({name: '(simple default)', refName: 'default'})
    }
    return templates
  }

  function getTemplateInfo(item) {
    const template = require(item.filename)
    return Object.assign({}, item, { name: template.templateName || item.refName})
  }

  function* getTemplatesFrom(dir, prefix = '') {
    const isJS = /\.js$/
    for (let file of fs.readdirSync(dir)) {
      const fullFilename = path.join(dir, file)
      if (fs.statSync(fullFilename).isDirectory()) {
        yield* getTemplatesFrom(fullFilename, path.join(prefix, dir))
      } else if (isJS.test(file)) {
        yield {filename: fullFilename, refName: path.join(prefix, file.substring(0, file.length - 3))
      }
    }
  }
}

function run() {
  return {
    options: [
      ['production|prod|p', 'Only run production scripts'],
      ['yes', 'Automatically confirm deployment']
    ],
    action({production = false, yes: confirmed = false}) {
      return core.runMigrations({production, confirmation: confirmed ? undefined : confirmation})
    }
  }
}

function ensureNoDevelopmentScripts() {
  return {
    async action() {
      const migrations = await core.loadAllMigrations()
      if (migrations.some(mig => mig.inDevelopment)) {
        throw new Error('There are migration scripts still in develoment.')
      }
    }
  }
}

async function confirmation() {
  //if (require('tty').isatty(process.stdin)) return true
  if (process.argv.includes('--yes')) return true
  const {confirmed} = await inquirer.prompt([
    {
      message: 'Do you want to run these migrations?',
      type: 'confirm',
      name: 'confirmed',
      prefix: '',
      default: false
    }
  ])
  return confirmed
}