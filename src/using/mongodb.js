const {MongoClient} = require('mongodb'),
  _ = require('lodash')

module.exports = _.memoize(function(mongoURL) {
  return {
    setup() {
      return {
        open() {
          return MongoClient.connect(mongoURL)
        },

        close(mongo) {
          return mongo.close()
        }
      }
    }
  }
})