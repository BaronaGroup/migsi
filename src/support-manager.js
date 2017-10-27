"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const config_1 = require("./config");
class SupportManager {
    constructor(migrations) {
        this.remainingMigrations = [...migrations];
        this.prepared = [];
    }
    async prepare(migration) {
        this.remainingMigrations.splice(this.remainingMigrations.indexOf(migration), 1);
        for (let support of migration.using || []) {
            await this.prepareSupport(support);
        }
        return (migration.using || []).map(support => {
            const found = this.prepared.find(preparedSupport => preparedSupport.identity === support);
            if (!found)
                throw new Error('Internal error');
            return found.value;
        });
    }
    async finish() {
        const toClose = this.prepared.filter(preparedSupport => !this.remainingMigrations.some(migration => (migration.using || []).some(support => preparedSupport.identity === support)));
        for (let supportToClose of toClose) {
            if (isCloseable(supportToClose.implementation)) {
                supportToClose.implementation.close(supportToClose.value);
            }
            else {
                const valueClose = _.get(supportToClose, 'value.close');
                if (valueClose) {
                    supportToClose.value.close(supportToClose.value);
                }
            }
        }
        this.prepared = _.difference(this.prepared, toClose);
        function isCloseable(implementation) {
            return !!implementation.close;
        }
    }
    async prepareSupport(identity) {
        if (this.prepared.some(preparedSupport => preparedSupport.identity === identity)) {
            return;
        }
        const rawImplementation = loadSupport(identity);
        if (!rawImplementation)
            throw new Error('Could not find code dependency ' + identity);
        const implementation = (isSetuppable(rawImplementation) ? await rawImplementation.setup(config_1.config) : rawImplementation);
        const value = await (isOpenable(implementation) ? implementation.open(config_1.config) : implementation(config_1.config));
        this.prepared.push({ identity, value, implementation });
        function isSetuppable(implementation) {
            return !!implementation.setup;
        }
        function isOpenable(implementation) {
            return !!implementation.open;
        }
    }
    async destroy() {
        this.remainingMigrations = [];
        return await this.finish();
    }
}
exports.default = SupportManager;
function noop() {
}
function loadSupport(identity) {
    if (typeof identity === 'string') {
        const usings = config_1.config.using;
        return (usings || {})[identity];
    }
    else {
        return identity;
    }
}
