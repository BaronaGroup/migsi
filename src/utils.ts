import {config} from './config'
import defaultLogger from './default-logger'

export const delay = (msec : number) => new Promise(resolve => setTimeout(resolve, msec))


export function getLogger() {
  return config.logger || defaultLogger
}
