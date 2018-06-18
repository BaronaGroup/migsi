
module.exports = {
  templateName: '[[TEMPLATE_NAME]]', // migsi-template-exclude-line
  inDevelopment: true, // set to false to have production mode runs include this script
  version: 'hash', // by default a hash of this file is used; otherwise increment if you want the script to be re-run during development
  friendlyName: "[[FRIENDLY_NAME]]",
  dependencies: '[[IMPLICIT_DEPENDENCIES]]',

  run: async function() {
    throw new Error('Not implemented')
  }
}