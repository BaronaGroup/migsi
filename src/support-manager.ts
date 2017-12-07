import * as _ from 'lodash'
import {config} from './config'

export default class SupportManager {
  remainingMigrations: Migration[]
  prepared: Using[]

  constructor(migrations : Migration[]) {
    this.remainingMigrations = [...migrations]
    this.prepared = []
  }

  async prepare(migration : Migration) {
    this.remainingMigrations.splice(this.remainingMigrations.indexOf(migration), 1)
    for (let support of migration.using || []) {
      await this.prepareSupport(support)
    }
    return (migration.using || []).map(support => {
      const found = this.prepared.find(preparedSupport => preparedSupport.identity === support)
      if (!found) throw new Error('Internal error')
      return found.value
    })
  }

  async finish() {
    const toClose = this.prepared.filter(preparedSupport => !this.remainingMigrations.some(migration => (migration.using || []).some(support => preparedSupport.identity === support)))
    for (let supportToClose of toClose) {
      if (isCloseable(supportToClose.implementation)) {
        await supportToClose.implementation.close(supportToClose.value)
      } else {
        const valueClose = _.get(supportToClose, 'value.close')
        if (valueClose) {
          await supportToClose.value.close(supportToClose.value)
        }
      }
    }
    this.prepared = _.difference(this.prepared, toClose)


    function isCloseable(implementation : ActiveUsingDeclaration) : implementation is CloseableUsing {
      return !!(implementation as CloseableUsing).close
    }
  }

  async prepareSupport(identity : AnyUsingDeclaration) {
    if (this.prepared.some(preparedSupport => preparedSupport.identity === identity)) {
      return
    }
    const rawImplementation = loadSupport(identity)
    if (!rawImplementation) throw new Error('Could not find code dependency ' + identity)
    const implementation = <UnopenedUsingDeclaration>(isSetuppable(rawImplementation) ? await rawImplementation.setup(config) : rawImplementation)

    const value = await (isOpenable(implementation) ? implementation.open(config) : implementation(config))

    this.prepared.push({identity, value, implementation})

    function isSetuppable(implementation : SetuppableUsingDeclaration | ActiveUsingDeclaration) : implementation is SetuppableUsingDeclaration {
      return !!(implementation as SetuppableUsingDeclaration).setup
    }

    function isOpenable(implementation : ActiveUsingDeclaration) : implementation is OpenableUsing {
      return !!(implementation as OpenableUsing).open
    }

  }

  async destroy() {
    this.remainingMigrations = []
    return await this.finish()
  }
}

function noop() {

}

function loadSupport(identity : AnyUsingDeclaration) {
  if (typeof identity === 'string') {
    const usings = config.using
    return (usings || {})[identity]
  } else {
    return identity
  }
}
