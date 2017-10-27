"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const _ = require("lodash");
const api = {
    loadPastMigrations,
    updateStatus
};
exports.defaultCollectionName = 'migsimigrations';
function default_1(mongoURL, collection = exports.defaultCollectionName) {
    if (!mongoURL)
        throw new Error('mongo storage must be given a mongo URL to connect to');
    return Object.assign({}, api, {
        mongoURL,
        collection
    });
}
exports.default = default_1;
function loadPastMigrations() {
    const that = this;
    return withConnection(this.mongoURL, async function (db) {
        const collection = db.collection(that.collection);
        return await collection.find({}).sort({ runDate: 1 }).toArray();
    });
}
async function withConnection(mongoURL, handler) {
    const db = await mongodb_1.MongoClient.connect(mongoURL);
    try {
        return await handler(db);
    }
    finally {
        await db.close();
    }
}
async function updateStatus(migration) {
    const that = this;
    await withConnection(this.mongoURL, async function (db) {
        const collection = db.collection(that.collection);
        const toSet = _.omit(_.omitBy(migration, entry => _.isFunction(entry)), 'toBeRun', 'eligibleToRun');
        await collection.updateOne({ migsiName: migration.migsiName }, { $set: toSet }, { upsert: true });
    });
}
