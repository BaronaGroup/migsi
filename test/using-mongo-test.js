"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const chai_1 = require("chai");
const mongodb_1 = require("mongodb");
const utils_1 = require("../src/utils");
const fs = require("fs");
const path = require("path");
describe('mongo-storage-test', function () {
    const defaultMongoURL = 'mongodb://localhost/migsi-test';
    const mongoURL = process.env.MIGSI_MONGO_URL || defaultMongoURL;
    const collectionName = 'testCollection';
    let enabled = false;
    describe('using-mongo-test', function () {
        before(async function () {
            let connection;
            try {
                connection = await mongodb_1.MongoClient.connect(mongoURL);
            }
            catch (err) {
                console.warn(`Mongo-storage tests are disabled: failed to connect to mongo at ${mongoURL}; please provide an URL to the ` +
                    'mongo you wish to use to run these tests as the environment variable MIGSI_MONGO_URL ' +
                    `to override the default (${defaultMongoURL})`);
            }
            if (connection) {
                try {
                    await Promise.all([
                        connection.collection(collectionName).remove({}),
                    ]);
                    await utils_1.delay(200); // another connection might not see the changes immediately, so we delay a bit here
                    enabled = true;
                }
                catch (err) {
                    console.error(err.stack);
                    throw new Error(err);
                }
                finally {
                    await connection.close();
                }
            }
            test_utils_1.configure({
                using: {
                    mongodb: require('../using/mongodb')(mongoURL)
                }
            });
        });
        beforeEach(test_utils_1.wipeWorkspace);
        it('works', async function () {
            if (!enabled)
                return this.skip();
            async function run(mongodb, collectionName) {
                const collection = mongodb.collection(collectionName);
                chai_1.assert.equal(await collection.count({}), 0);
                await collection.insert({ color: 'yellow' });
                chai_1.assert.equal(await collection.count({}), 1);
            }
            const migrationBody = `
      const import {assert} from 'chai'
      module.exports = {
        using: ['mongodb', () => '${collectionName}'],
        run: ${run.toString()}
      }       
      `;
            fs.writeFileSync(path.join(__dirname, '..', 'test-workspace', 'migration.migsi.js'), migrationBody, 'UTF-8');
            await test_utils_1.runMigrations();
            const conn = await mongodb_1.MongoClient.connect(mongoURL);
            chai_1.assert.equal(await conn.collection(collectionName).count({}), 1);
            await conn.close();
        });
    });
});
