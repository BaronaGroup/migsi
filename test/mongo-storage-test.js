"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_utils_1 = require("./test-utils");
const mongo_1 = require("../src/storage/mongo");
const chai_1 = require("chai");
const mongodb_1 = require("mongodb");
const utils_1 = require("../src/utils");
describe('mongo-storage-test', function () {
    const defaultMongoURL = 'mongodb://localhost/migsi-test';
    const mongoURL = process.env.MIGSI_MONGO_URL || defaultMongoURL;
    const customCollectionName = 'anothercollection';
    let enabled = false;
    describe('mongo-storage-test', function () {
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
                        connection.collection(customCollectionName).remove({}),
                        connection.collection(mongo_1.defaultCollectionName).remove({}),
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
        });
        beforeEach(test_utils_1.wipeWorkspace);
        it('can be given a mongo URL', function () {
            if (!enabled)
                return this.skip();
            test_utils_1.configure({ storage: mongo_1.default(mongoURL) });
        });
        it('throws without an URL', async function () {
            await test_utils_1.expectFailure(async function () {
                test_utils_1.configure({ storage: mongo_1.default('') });
            }());
        });
        it('works', async function () {
            if (!enabled)
                return this.skip();
            test_utils_1.configure({ storage: mongo_1.default(mongoURL) });
            await test_utils_1.createMigration('a');
            await test_utils_1.runMigrations();
            await test_utils_1.createMigration('b');
            await test_utils_1.runMigrations();
            test_utils_1.assertMigrations(['a', 'b']);
        });
        it('is possible to use another collection', async function () {
            if (!enabled)
                return this.skip();
            test_utils_1.configure({ storage: mongo_1.default(mongoURL, customCollectionName) });
            await test_utils_1.createMigration('a');
            await test_utils_1.runMigrations();
            await utils_1.delay(200); // another connection might not see the changes immediately, so we delay the assert a bit
            const db = await mongodb_1.MongoClient.connect(mongoURL);
            try {
                chai_1.assert.equal(await db.collection(customCollectionName).count({}), 1);
            }
            finally {
                await db.close();
            }
        });
    });
});
