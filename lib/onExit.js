/**
 * Add an event to call on process exist
 * @param {function} fn 
 */
function onExit(fn) {
  process.on('exit', fn.bind(null, 'exit'))
  //catches ctrl+c event
  process.on('SIGINT', fn.bind(null, 'SIGINT'))
  // catches "kill pid" (for example: nodemon restart)
  process.on('SIGUSR1', fn.bind(null, 'SIGUSR1'))
  process.on('SIGUSR2', fn.bind(null, 'SIGUSR2'))
  //catches uncaught exceptions
  process.on('uncaughtException', fn.bind(null, 'uncaughtException'))
}

module.exports = onExit