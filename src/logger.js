exports.log = (...args) => {
  if (!process.env.MIGSI_QUIET) {
    console.log(...args)
  }
}

exports.warn = (...args) => {
  if (!process.env.MIGSI_QUIET) {
    console.warn(...args)
  }
}

exports.error = (...args) => {
  if (!process.env.MIGSI_QUIET) {
    console.error(...args)
  }
}

exports.write = (...args) => {
  if (!process.env.MIGSI_QUIET) {
    process.stdout.write  (...args)
  }
}