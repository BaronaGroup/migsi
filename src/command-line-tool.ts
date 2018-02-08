import * as core from './core'
import * as nodeGetoptLong from 'node-getopt-long'
import {config, getDir, setupConfig, findAndLoadConfig} from './config'
import logger from './logger'
import * as path from 'path'
import * as inquirer from 'inquirer'
import * as _ from 'lodash'
import * as fs from 'fs'
import {outputProcessor} from './output-tracker'
import * as cliColor from 'cli-color'
import * as moment from 'moment'

interface Options {
  config?: string
}

type NoOptions = Options

interface Command {
  options: nodeGetoptLong.Option[],
  action: (args: Options) => Promise<void>
}

interface OutputOptions extends Options {
  name?: string,
  since?: string
  until?: string
  failed?: boolean
  raw?: boolean
}

interface RunOptions extends Options {
  //{production = false, yes: confirmed = false, 'dry-run': dryRun}
  production?: boolean,
  yes?: boolean,
  'dry-run'?: boolean
}

interface CreateTemplateOptions {
  name?: string
}

interface CreateOptions {
  friendlyName?: string
  template?: string
}

interface TemplateInfo {
  filename?: string
  refName: string
  name?: string
}

interface CommandList {
  [index: string]: Command
}

const commands: CommandList = {
  'list': <Command>list(),
  'create': <Command>create(),
  'run': <Command>run(),
  'ensure-no-development-scripts': <Command>ensureNoDevelopmentScripts(),
  'create-template': <Command>createTemplate(),
  'output': <Command>output()
}

async function runApp() {
  const cmdLine = parseCommandLine()
  if (cmdLine.options.config) {
    setupConfig(require(cmdLine.options.config))
  } else {
    findAndLoadConfig()
  }
  await cmdLine.command.action(cmdLine.options)
}

runApp().catch(err => {
  if (!err.printed) {
    logger.error(err.stack || err)
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

  const options = <Options>nodeGetoptLong.options((cmdImpl.options || []).concat(defaultOptions), {
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
    action: async function (options: NoOptions) {
      const migrations = await core.loadAllMigrations()
      for (let migration of migrations) {
        logger.info(migration.migsiName, migration.inDevelopment ? 'dev ' : 'prod', migration.runDate || 'to-be-run')
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
    action: async ({name, since: rawSince, until: rawUntil, failed, raw}: OutputOptions) => {
      const since = parseDate(rawSince),
        until = parseDate(rawUntil, 1)

      const migrations = (await core.filterMigrations({name, since, until, failed}))
        .filter(m => m.hasBeenRun || m.failedToRun)

      for (let migration of migrations) {
        const linearRunOutput = outputProcessor.makeLinear(migration, 'run')
        logger.info(cliColor.xterm(33)('Migration: ' + migration.friendlyName))
        if (linearRunOutput.length) {
          logger.info(cliColor.xterm(129)('Run output'))
          for (let line of linearRunOutput) {
            process.stdout.write(outputLine(line))
          }
          logger.info('')
        }
        const linearRollbackOutput = outputProcessor.makeLinear(migration, 'rollback')
        if (linearRollbackOutput.length) {
          logger.info(cliColor.xterm(214)('Rolled back'))
          for (let line of linearRollbackOutput) {
            process.stdout.write(outputLine(line))
          }
          logger.info('contextSpecificLogLevels')
        }
        const exception = migration.output && migration.output.exception
        if (exception) {
          logger.info(cliColor.xterm(9)('Exception: ' + exception.message))
          if (exception.stack) {
            logger.info(exception.stack)
          }
          logger.info('')
        }
      }

      function outputLine(line: OutputLineWithStream) {
        if (raw) return line.data
        const lastChar = line.data[line.data.length - 1]
        const terminator = lastChar === '\n' || lastChar === '\r' ? '' : '\n'
        const streamColor = line.stream === 'stdout' ? 78 : 161
        return [cliColor.xterm(72)(new Date(line.timestamp).toISOString()), ' ', cliColor.xterm(streamColor)(line.stream), ' ', line.data, terminator].join('')
      }
    }
  }

  function parseDate(dateStr: string | undefined, dayOffset = 0) {
    if (!dateStr) return undefined
    const isFullISOString = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d.\d{3}.+$/,
      isDuration = /^(\d+)\s*(\w+)$/

    if (isFullISOString.test(dateStr)) return new Date(dateStr)
    if (isDuration.test(dateStr)) {
      const match = dateStr.match(isDuration) || []
      const [, amount, unit] = match
      const duration = moment.duration(parseInt(amount), <moment.unitOfTime.Base>unit)
      return moment().subtract(duration).toDate()
    }

    const extractor = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{3})))?)?$/
    const [, year = '', month = '', day = '', hour = '0', minute = '0', second = '0', msec = '0'] = dateStr.match(extractor) || []

    if (!year) throw new Error('Invalid date format')
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day) + dayOffset, parseInt(hour), parseInt(minute), parseInt(second), parseInt(msec))
  }
}

function createTemplate() {
  return {
    options: [
      ['name|n=s', 'Name for the template']
    ],
    action: async function ({name: rawName}: CreateTemplateOptions) {
      const name = rawName || await queryName()

      const filename = await core.createTemplate(name)
      logger.info('Template created as ', path.relative(process.cwd(), filename))

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
    async action({friendlyName, template = 'default'}: CreateOptions) {
      if (!friendlyName) {
        return await createWizard()
      }
      const filename = await core.createMigrationScript(friendlyName, template)
      logger.info('Migration script created: ' + filename)
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

  const find = templates.find(item => item.name === answers.template)
  if (!find) throw new Error('Internal error')
  const filename = await core.createMigrationScript(answers.scriptName, find.refName)
  logger.info('The script can be found to be edited at ' + path.relative(process.cwd(), filename))
}

function getTemplates() {
  const customTemplateDir = getDir("templateDir")
  const templates = [...getTemplatesFrom(customTemplateDir)].map(getTemplateInfo)
  if (!templates.some(item => item.refName === 'default')) {
    templates.push({name: '(simple default)', refName: 'default'})
  }
  return templates
}

function getTemplateInfo(item: TemplateInfo) {
  if (!item.filename) throw new Error('Internal error')
  const template = require(item.filename)
  return Object.assign({}, item, {name: template.templateName || item.refName})
}

function* getTemplatesFrom(dir: string, prefix = ''): IterableIterator<TemplateInfo> {
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
    async action({production = false, yes: confirmed = false, 'dry-run': dryRun}: RunOptions) {
      await core.runMigrations({production, confirmation: confirmed ? undefined : confirmation, dryRun})
    }
  }
}

function ensureNoDevelopmentScripts() {
  return {
    async action(options: Options) {
      const migrations = await core.loadAllMigrations()
      if (migrations.some(mig => mig.inDevelopment)) {
        throw new Error('There are migration scripts still in development.')
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