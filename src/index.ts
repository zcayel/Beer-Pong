import { buildTable, buildRack } from './table'
import { initGame } from './game'
import { setupUi } from './ui'

export function main() {
  buildTable()
  buildRack() // must run before initGame — cup bodies are built from the rack
  initGame()
  setupUi()
}
