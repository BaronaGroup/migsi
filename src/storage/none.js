const api = {
  loadPastMigrations,
  updateStatus
}

module.exports = api

function loadPastMigrations() {
  return []
}

async function updateStatus(migration) {
  throw new Error('Storage "none" does not support running migrations.')
}

