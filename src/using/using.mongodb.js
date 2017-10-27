"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const _ = require("lodash");
module.exports = _.memoize(function (mongoURL) {
    return {
        setup() {
            return {
                open() {
                    return mongodb_1.MongoClient.connect(mongoURL);
                },
                close(mongo) {
                    return mongo.close();
                }
            };
        }
    };
});
