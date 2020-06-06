var dlnacasts = require('./dlna')()
var server = require('./lib/server')
var onExit = require('./lib/onExit')
var readcommand = require('readcommand')
var EventEmitter = require('eventemitter2').EventEmitter2
var parseTorrent = require('parse-torrent')
var debug = require('debug')('bitcast:cast')

var isTorrent = url => {
  try {
    return url.match(/[.]torrent$/) || parseTorrent(url)
  } catch(error) {
    return false
  }
}
var isHttp = url => url.match(/^https?\:\/\//)

var url = process.argv[2];

if (!url) {
  throw new Error('Please specify url argument')
}

var getPlayers = () => new Promise(function(resolve) {
  if (dlnacasts.players.length) {
    resolve(dlnacasts.players)
  } else {
    dlnacasts.once('update', function (player) {
      resolve(dlnacasts.players)
    })
  }
})

var castWithRetry = (url, retries = 5, interval = 5000) => {
  cast(url).catch(error => {
    debug(error)
    console.log('Cast failed, retrying...')
    setTimeout(() => castWithRetry(url, retries - 1, interval))
  })
}

if (!isHttp(url) && isTorrent(url)) {
  var magnet = url
  console.log('Starting torrent stream', magnet)
  server(magnet, function(url, server, client, type) {
    console.log('Server created at url', url, type)
    castWithRetry(url)
    onExit(function() {
      server.close()
      if (!client.destroyed) {
        client.destroy()
      }
    })
  })
} else {
  console.log('Starting http stream', url)
  castWithRetry(url)
}

var sigints = 0;
var playerState = null
var currentPlayer = null
var noPlayerFoundMsg = 'No playable devices found network'

var createError = ({msg, ...props}) => {
  const error = new Error(msg)
  Object.assign(error, props)
  return error
}

function cast(url) {
  return new Promise((resolve, reject) => {
    getPlayers().then(function(players) {
      if (!players.length) {
        console.log(noPlayerFoundMsg)
        return reject(createError({ msg: noPlayerFoundMsg, name: 'NoDNLAPlayerFoundError' }))
      }
      console.log('Available players: ', dlnacasts.players.map(player => player.name))
      players.some(function(player) {
        console.log('casting video to device', player.name, url)
        player.play(url, {title: 'Streamcaster Torrent'}, () => resolve())
        player.on('status', function(status) {
          console.log('Player status', status)
          playerState = status
          resolve(status)
        })
        player.on('error', function(error) {
          console.log('Player error', error)
          reject(error)
        })
        currentPlayer = player
        return player
      })
    })
  })
}

readCommands()

function readCommands() {

  const commandEvent = new EventEmitter()

  debug('commandEvent', commandEvent)

  const allowedCommands = [
    'stop',
    'start',
    'play',
    'pause',
    'resume',
    'volume',
    'seek'
  ]

  // run command
  commandEvent.onAny((command, value) => {
    console.log('Received command', command, value)
    try {
      currentPlayer[command](value, () => {
        console.log('Completed command %s', command, value)
      })
    } catch(err) {
      console.log('Error occurred procesisng command', err)
    }
  })

  readcommand.loop(function(err, args, str, next) {
    
    if (err) return readErrors(err, next)

    debug('Received args', args);

    if (args.length) {
      const msg = args.join(' ')

      debug('Player state', playerState)

      if (!currentPlayer || !playerState) {
        const state = playerState ? playerState.playerState : 'unknown'
        console.log('Please wait for player to start. State: %o', playerState)
        return next()
      }

      const parsedCommand = parseCommand(msg)
      debug('command', parsedCommand)
      if (parsedCommand) {
        const {command, value} = parsedCommand
        if (allowedCommands.includes(command)) {
          debug('emitting command', command, value)
          commandEvent.emit(command, value)
        } else {
          debug('Invalid command', command, value)
          invalidCommandMsg()
        }
      }

    } else {
      invalidCommandMsg()
    }

    return next();
  });
}

function invalidCommandMsg() {
  console.log(`
    Please enter a command
      seek [time]
      play
      stop
      pause
      resume
    `)
}

function parseCommand(msg) {
  const matches = msg.match(/^([a-z]+)\s*(.+)?$/i)
  if (matches) {
    const [, command, value] = matches
    debug('parsed command', command, value)
    return {command, value}
  }
  return false
}

function readErrors(err, next) {
  if (err && err.code !== 'SIGINT') {
      throw err;
  } else if (err) {
      if (sigints === 1) {
          process.exit(0);
      } else {
          sigints++;
          console.log('Press ^C again to exit.');
          return next && next();
      }
  } else {
      sigints = 0;
  }
}
