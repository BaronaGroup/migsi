import {MongoClient, Db} from 'mongodb'
import * as _ from 'lodash'


module.exports = _.memoize(function(mongoURL : string) {
  return {
    setup() {
      return {
        open() {
          return MongoClient.connect(mongoURL)
        },

        close(mongo : Db) {
          return mongo.close()
        }
      }
    }
  }
})