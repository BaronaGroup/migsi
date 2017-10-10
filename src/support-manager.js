const _ = require('lodash'),
  config = require('./config')

module.exports = class SupportManager {
  constructor(migrations) {
    this.remainingMigrations = [...migrations]
    this.prepared = []
  }

  async prepare(migration) {
    this.remainingMigrations.splice(this.remainingMigrations.indexOf(migration), 1)
    for (let support of migration.using || []) {
      await this.prepareSupport(support)
    }
    return (migration.using || []).map(support => this.prepared.find(preparedSupport => preparedSupport.identity = support).value)
  }

  async finish() {
    const toClose = this.prepared.filter(preparedSupport => !this.remainingMigrations.some(migration => (migration.using || []).some(support => preparedSupport.identity === support)))
    for (let supportToClose of toClose) {
      await (supportToClose.implementation.close || _.get(supportToClose, ['value', 'close']) || noop)()
    }
    this.prepared = _.difference(this.prepared, toClose)
  }

  async prepareSupport(identity) {
    if (this.prepared.some(preparedSupport => preparedSupport.identity === identity)) {
      return
    }
    const rawImplementation = loadSupport(identity)
    if (!rawImplementation) throw new Error('Could not find code dependency ' + identity)
    const implementation = rawImplementation.setup ? await rawImplementation.setup(config) : rawImplementation
    const value = await (implementation.open || implementation)(config)

    this.prepared.push({identity, value, implementation})
  }

  async destroy() {
    this.remainingMigrations = []
    return await this.finish()
  }
}

function noop() {

}

function loadSupport(identity) {
  if (_.isString(identity)) {
    return _.get(config, ['using', identity])
  } else {
    return identity
  }
}
