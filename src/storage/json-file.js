"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const fs = require("fs");
const api = {
    loadPastMigrations,
    updateStatus
};
function default_1(filename) {
    if (!filename)
        throw new Error('Filename is required for json-storage');
    return Object.assign({}, api, {
        filename
    });
}
exports.default = default_1;
function loadPastMigrations() {
    if (!fs.existsSync(this.filename)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(this.filename, 'UTF-8'));
}
async function updateStatus(migration) {
    const newEntry = _.omit(_.omitBy(migration, (entry) => _.isFunction(entry)), 'toBeRun', 'eligibleToRun');
    const data = this.loadPastMigrations();
    const entry = data.find(entry => entry.migsiName === migration.migsiName);
    if (!entry) {
        data.push(newEntry);
    }
    else {
        Object.assign(entry, newEntry);
    }
    fs.writeFileSync(this.filename, JSON.stringify(data, null, 2), 'UTF-8');
}
