import * as fs from 'fs'
import * as path from 'path'

export const config: Config = {}
declare function require(name:string) : any


export const setupConfig = (newConfig: Config) => {
  const existingConfigAny = <any>config
  for (let key of Object.keys(config)) {
    delete existingConfigAny[key]
  }
  Object.assign(config, newConfig, getEnvironmentConfig())
}

export const loadConfig = function (configPath: string) {
  const configObj = require(configPath)
  let actualConfigObj: Config = configObj.default || configObj
  if (!actualConfigObj.pathsRelativeTo) actualConfigObj.pathsRelativeTo = path.dirname(configPath)
  setupConfig(actualConfigObj)
}

export const findAndLoadConfig = function () {
  const configPath = findConfigPath()
  return loadConfig(configPath)
}

export const getDir = (configKey: ConfigDirectoryKey) => {
  const confDir = (<any>config)[configKey]
  if (!confDir) return undefined
  if (path.isAbsolute(confDir)) {
    return confDir
  } else {
    if (!config.pathsRelativeTo) throw new Error('pathRelativeTo must be present if relative paths are used')
    return path.join(config.pathsRelativeTo, confDir)
  }
}

function findConfigPath(from = __dirname): string {
  let rcpath = from + '/.migsirc'
  if (fs.existsSync(rcpath)) {
    return rcpath
  }
  const newPath = path.resolve(from, '..')
  if (newPath === '/') throw new Error('Could not find .migsirc')
  return findConfigPath(newPath)
}

function getEnvironmentConfig() {
  const additions: Partial<Config> = {}
  if (process.env.MIGSI_ALLOW_RERUNNING_ALL_MIGRATIONS) {
    additions.allowRerunningAllMigrations = true
  }
  return additions
}
