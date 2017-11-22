//import {Question} from 'inquirer'

interface Config {
  pathsRelativeTo?: string,
  allowRerunningAllMigrations?: boolean,
  storage?: Storage,
  prefixAlgorithm?: () => string,
  failOnDevelopmentScriptsInProductionMode?: boolean,
  rollbackAll?: boolean,
  confirmation?: (migrations: RunnableMigration[], extra: any) => Promise<void>
  using?: {
    [index: string]: SetuppableUsingDeclaration | ActiveUsingDeclaration
  }
  disableOutputTracking?: boolean
}

interface SetuppableUsingDeclaration {
  setup: (config: Config) => Promise<ActiveUsingDeclaration>
}

interface OpenableUsing {
  open: (config: Config) => Promise<any>
}

interface CloseableUsing {
  close: (openValue: any) => Promise<void>
}

type UnopenedUsingDeclaration = OpenableUsing | ((config: Config) => Promise<any>)
type ActiveUsingDeclaration =
  OpenableUsing
  | CloseableUsing
  | (OpenableUsing & CloseableUsing)
  | ((config: Config) => Promise<any>)


interface UsingImplementation {

}

interface OutputLine {
  data: string,
  timestamp: number
}

interface OutputLineWithStream extends OutputLine {
  stream: string
}

interface ExceptionInfo {
  message: string,
  stack: string
}

type AnyUsingDeclaration = SetuppableUsingDeclaration | ActiveUsingDeclaration | string

interface Migration {
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

interface RunnableMigration extends Migration {
  run: (...params: any[]) => Promise<void>
  rollback: (...params: any[]) => Promise<void>

}

interface Storage {
  loadPastMigrations: () => Promise<Migration[]> | Migration[]
  updateStatus: (migration: Migration) => Promise<void> | void
}

interface Using {
  identity: AnyUsingDeclaration,
  value: any,
  implementation: ActiveUsingDeclaration
}

type ConfigDirectoryKey = "migrationDir" | "templateDir"

interface MigrationFilters {
  name?: string,
  since?: Date,
  until?: Date,
  failed?: boolean
}

declare module "dependency-solver" {
  export function solve(tree: any): string[]
}

interface TemplateVariables {
  friendlyName: string
}

interface RunOptions {
  production?: boolean,
  dryRun?: boolean,
  skipProgressFlag?: boolean,
  confirmation?: (migrations: RunnableMigration[]) => Promise<any> | any
}

declare module "node-getopt-long" {
  export type Option = string[]

  export function options(options: Option[], getoptOptions: object): object
}
