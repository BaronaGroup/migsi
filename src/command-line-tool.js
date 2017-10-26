
const core = require('./core'),
  nodeGetoptLong = require('node-getopt-long'),
  config = require('./config'),
  logger = require('./logger'),
  path = require('path'),
  inquirer = require('inquirer'),
  _ = require('lodash'),
  fs = require('fs'),
  {outputProcessor} = require('./output-tracker'),
  cliColor = require('cli-color'),
  moment = require('moment')

const commands = {
  'list': list(),
  'create': create(),
  'run': run(),
  'ensure-no-development-scripts': ensureNoDevelopmentScripts(),
  'create-template': createTemplate(),
  'output': output()
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

function output() {
  return {
    options: [
      ['name|n=s', 'Name of the migration script whose output you want'],
      ['since|s=s', 'Date/datetime (ISO format only) for when to start listing output from'],
      ['until|u=s', 'Date/datetime (ISO format only) for when to stop listing output'],
      ['failed|f', 'List output for the latest failed migration, if any'],
      ['raw|r', 'Do not add timestamps and streams to output']
    ],
    action: async ({name, since: rawSince, until: rawUntil, failed, raw}) => {
      const since = parseDate(rawSince),
        until = parseDate(rawUntil, 1)

      const migrations = (await core.filterMigrations({name, since, until, failed}))
        .filter(m => m.hasBeenRun || m.failedToRun)

      for (let migration of migrations) {
        const linearRunOutput = outputProcessor.makeLinear(migration, 'run')
        console.log(cliColor.xterm(33)('Migration: ' + migration.friendlyName))
        if (linearRunOutput.length) {
          console.log(cliColor.xterm(129)('Run output'))
          for (let line of linearRunOutput) {
            process.stdout.write(outputLine(line))
          }
          console.log('')
        }
        const linearRollbackOutput = outputProcessor.makeLinear(migration, 'rollback')
        if (linearRollbackOutput.length) {
          console.log(cliColor.xterm(214)('Rolled back'))
          for (let line of linearRollbackOutput) {
            process.stdout.write(outputLine(line))
          }
          console.log('')
        }
        const exception = migration.output.exception
        if (exception) {
          console.log(cliColor.xterm(9)('Exception: ' + exception.message))
          if (exception.stack) {
            console.log(exception.stack)
          }
          console.log('')
        }
      }

      function outputLine(line) {
        if (raw) return line.data
        const lastChar = line.data[line.data.length - 1]
        const terminator = lastChar === '\n' || lastChar === '\r' ? '' : '\n'
        const streamColor = line.stream === 'stdout' ? 78 : 161
        return [cliColor.xterm(72)(new Date(line.timestamp).toISOString()), ' ', cliColor.xterm(streamColor)(line.stream), ' ', line.data, terminator].join('')
      }
    }
  }

  function parseDate(dateStr, dayOffset = 0) {
    if (!dateStr) return undefined
    const isFullISOString = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d.\d{3}.+$^/,
      isDuration = /^(\d+)\s*(\w+)$/

    if (isFullISOString.test(dateStr)) return new Date(dateStr)
    if (isDuration.test(dateStr)) {
      const [, amount, unit] = dateStr.match(isDuration)
      return moment().subtract(amount, unit).toDate()
    }

    const extractor = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{3})))?)?$/
    const [, year, month, day, hour = 0, minute = 0, second = 0, msec = 0] = dateStr.match(extractor) || []
    if (!year) throw new Error('Invalid date format')
    return new Date(year, month - 1, day + dayOffset, hour, minute, second, msec)
  }
}

function createTemplate() {
  return {
    options: [
      ['name|n=s', 'Name for the template']
    ],
    action: async function ({name: rawName}) {
      const name = rawName || await queryName()

      const filename = await core.createTemplate(name)
      logger.log('Template created as ', path.relative(process.cwd(), filename))

      async function queryName() {
        const {name} = await inquirer.prompt({
          message: 'Please enter for template',
          name: 'name',
          prefix: '',
          suffix: ':'
        })
        return name
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
  return Object.assign({}, item, {name: template.templateName || item.refName})
}

function* getTemplatesFrom(dir, prefix = '') {
  const isJS = /\.js$/,
    isTemplateJS = /\.template\.js$/
  for (let file of fs.readdirSync(dir)) {
    const fullFilename = path.join(dir, file)
    if (fs.statSync(fullFilename).isDirectory()) {
      yield* getTemplatesFrom(fullFilename, path.join(prefix, dir))
    } else if (isTemplateJS.test(file)) {
      yield {filename: fullFilename, refName: path.join(prefix, file.substring(0, file.length - 12))}
    } else if (isJS.test(file)) {
      yield {filename: fullFilename, refName: path.join(prefix, file.substring(0, file.length - 3))}
    }
  }
}

function run() {
  return {
    options: [
      ['production|prod|p', 'Only run production scripts'],
      ['yes', 'Automatically confirm deployment'],
      ['dry-run|d', 'Pretend to run migrations without actually doing so']
    ],
    action({production = false, yes: confirmed = false, 'dry-run': dryRun}) {
      return core.runMigrations({production, confirmation: confirmed ? undefined : confirmation, dryRun})
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