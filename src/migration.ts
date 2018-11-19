import {Config} from './config'
import {AnyUsingDeclaration} from './support-manager'

export interface OutputLine {
  data: string,
  timestamp: number
}

interface ExceptionInfo {
  message: string,
  stack: string
}

export interface TemplateVariables {
  friendlyName: string
}


export interface Migration {
  using: AnyUsingDeclaration[] ,
  migsiName: string,
  dependencies: string[],
  toBeRun: boolean,
  eligibleToRun: boolean,
  inDevelopment: boolean,
  migsiVersion: number,
  hasBeenRun: boolean,
  hasActuallyBeenRun: boolean,
  version: string | number
  versionChanged: boolean,
  friendlyName: string,
  failedToRun: boolean,
  runDate: Date | null | string
  rolledBack: boolean
  archived?: boolean
  output?: {
    run?: {
      stdout?: OutputLine[]
      stderr?: OutputLine[]
    }
    rollback?: {
      stdout?: OutputLine[]
      stderr?: OutputLine[]
    }
    exception?: ExceptionInfo
    rollbackException?: ExceptionInfo
  }
}

export interface RunnableMigration extends Migration {
  run: (...params: any[]) => Promise<void>
  rollback: (...params: any[]) => Promise<void>

}
