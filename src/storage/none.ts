import {Migration} from '../migration'

const api = {
  loadPastMigrations,
  updateStatus
}

export default api

function loadPastMigrations() {
  return []
}

async function updateStatus(migration : Migration) {
  throw new Error('Storage "none" does not support running migrations.')
}

