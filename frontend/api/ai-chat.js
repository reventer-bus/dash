export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }

  const body = await req.json()
  const userMessage = (body.message || '').toLowerCase().trim()
  const currentParams = body.params || {}
  const pendingAction = body.pendingAction || null

  function runDfmCheck(op, opParams, modelParams) {
    const violations = []
    const wall = modelParams.wall || 1.2
    if (op === 'fillet') {
      const maxFillet = parseFloat((wall - 0.2).toFixed(1))
      if (opParams.radius > maxFillet) violations.push({ fix: maxFillet })
    }
    if (op === 'hole' && opParams.d < 2.0) violations.push({ fix: 2.0 })
    if (op === 'set_param' && opParams.wall && opParams.wall < 1.2) violations.push({ fix: 1.2 })
    return violations
  }

  let type = 'message', changes = {}, features = [], askUser = null, reply = ''

  if (pendingAction && ['yes','confirm','ok'].includes(userMessage)) {
    if (pendingAction.type === 'add_feature') {
      type = 'add_feature'; features = [pendingAction.feature]
      reply = '✅ Added ' + pendingAction.feature.op + ' — ' + pendingAction.feature.description
    }
  } else if (pendingAction && ['no','cancel'].includes(userMessage)) {
    reply = 'Cancelled. What else would you like to change?'
  } else if (userMessage.match(/(\d+)\s*(units?\s*)?(wide|width|columns?|grid.?x)/)) {
    const val = parseInt(userMessage.match(/(\d+)/)[1])
    changes.grid_x = val; type = 'set_param'; reply = 'Setting grid_x = ' + val
  } else if (userMessage.match(/(\d+)\s*(units?\s*)?(deep|depth|rows?|grid.?y)/)) {
    changes.grid_y = parseInt(userMessage.match(/(\d+)/)[1]); type = 'set_param'; reply = 'Setting grid_y = ' + changes.grid_y
  } else if (userMessage.match(/(\d+)\s*(units?\s*)?(tall|high|height)/)) {
    changes.height_u = parseInt(userMessage.match(/(\d+)/)[1]); type = 'set_param'; reply = 'Setting height_u = ' + changes.height_u
  } else if (userMessage.match(/wall\s*[=:]?\s*([\d.]+)/)) {
    const val = parseFloat(userMessage.match(/([\d.]+)/)[1])
    const v = runDfmCheck('set_param', { wall: val }, currentParams)
    changes.wall = v.length ? v[0].fix : val; type = 'set_param'
    reply = v.length ? 'DFM: wall ' + val + 'mm below minimum, fixed to ' + changes.wall + 'mm' : 'Setting wall = ' + val + 'mm'
  } else if (userMessage.match(/hole|cable|routing/)) {
    const dMatch = userMessage.match(/(\d+)\s*mm/)
    const d = dMatch ? parseInt(dMatch[1]) : null
    if (d) {
      type = 'ask_user'
      askUser = { question: 'Add a ' + d + 'mm cable routing hole on the front face?', pendingAction: { type: 'add_feature', feature: { op: 'hole', d, face: 'front', description: d + 'mm hole on front face' } } }
      reply = askUser.question
    } else {
      type = 'ask_user'; askUser = { question: 'What diameter? (e.g. "8mm hole")', pendingAction: null }; reply = askUser.question
    }
  } else if (userMessage.match(/fillet|round|smooth/)) {
    const rMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*mm/)
    const requestedR = rMatch ? parseFloat(rMatch[1]) : 1.0
    const v = runDfmCheck('fillet', { radius: requestedR }, currentParams)
    const finalR = v.length ? v[0].fix : requestedR
    const dfmNote = v.length ? ' DFM: ' + requestedR + 'mm exceeds max, auto-corrected to ' + finalR + 'mm' : ''
    type = 'ask_user'
    askUser = { question: 'Add ' + finalR + 'mm fillet on top inner edges?' + dfmNote, pendingAction: { type: 'add_feature', feature: { op: 'fillet', radius: finalR, edges: 'top_inner', description: finalR + 'mm fillet on top inner edges' } } }
    reply = askUser.question
  } else {
    reply = 'I can set grid_x, grid_y, height_u, wall — or add a hole/fillet. Try "make it 3 wide" or "add a 10mm fillet".'
  }

  return new Response(JSON.stringify({ type, changes, features, reply, message: reply, askUser }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
