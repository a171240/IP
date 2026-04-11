function getTurnId(turn) {
  if (!turn || !turn.id) return ""
  return String(turn.id)
}

function mergeDefined(target, source) {
  const next = { ...(target || {}) }
  Object.keys(source || {}).forEach((key) => {
    if (typeof source[key] !== "undefined") {
      next[key] = source[key]
    }
  })
  return next
}

function dedupeTurns(turns) {
  const list = []
  const indexById = Object.create(null)

  ;(turns || []).forEach((turn) => {
    const id = getTurnId(turn)
    if (!id) {
      list.push(turn)
      return
    }

    if (Object.prototype.hasOwnProperty.call(indexById, id)) {
      const index = indexById[id]
      list[index] = mergeDefined(list[index], turn)
      return
    }

    indexById[id] = list.length
    list.push(turn)
  })

  return list
}

function patchTurnById(turns, turnId, patch) {
  const list = dedupeTurns(turns)
  const id = String(turnId || "")
  const index = list.findIndex((turn) => getTurnId(turn) === id)
  if (index < 0) {
    return { updated: false, turns: list }
  }

  list[index] = mergeDefined(list[index], patch)
  return { updated: true, turns: list }
}

function replaceTurnById(turns, turnId, turn) {
  const list = dedupeTurns(turns)
  const id = String(turnId || "")
  const index = list.findIndex((item) => getTurnId(item) === id)
  if (index < 0) {
    return { updated: false, turns: list }
  }

  list[index] = mergeDefined({}, turn)
  return { updated: true, turns: dedupeTurns(list) }
}

function appendOrMergeTurn(turns, turn) {
  const list = dedupeTurns([...(turns || []), turn])
  return { turns: list }
}

function renameTurnId(turns, oldId, newId) {
  const list = dedupeTurns(turns)
  const beforeId = String(oldId || "")
  const afterId = String(newId || "")
  const index = list.findIndex((turn) => getTurnId(turn) === beforeId)
  if (index < 0) {
    return { updated: false, turns: list }
  }

  list[index] = mergeDefined(list[index], { id: afterId })
  return { updated: true, turns: dedupeTurns(list) }
}

module.exports = {
  appendOrMergeTurn,
  dedupeTurns,
  patchTurnById,
  renameTurnId,
  replaceTurnById,
}
