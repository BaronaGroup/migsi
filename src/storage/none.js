"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api = {
    loadPastMigrations,
    updateStatus
};
exports.default = api;
function loadPastMigrations() {
    return [];
}
async function updateStatus(migration) {
    throw new Error('Storage "none" does not support running migrations.');
}
