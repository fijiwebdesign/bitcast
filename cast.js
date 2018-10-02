var dlnacasts = require('./index')()
var server = require('./lib/server')
var onExit = require('./lib/onExit')
var readcommand = require('readcommand')
var EventEmitter = require('eventemitter2').EventEmitter2
var debug = require('debug')('cast')

var url = process.argv[2];
var isTorrent = process.argv[3] == 'torrent' || url.match(/[.?]torrent$/)

if (!url) {
  throw new Error('Please specify url argument')
}

var getPlayers = new Promise(function(resolve) {
  dlnacasts.once('update', function (player) {
    console.log('Available players: ', dlnacasts.players.map(player => player.name))
    resolve(dlnacasts.players)
  })
})

if (!url.match(/^http/) && !isTorrent) {
  var magnet = url
  console.log('Starting torrent stream', magnet)
  server(magnet, function(url, server, client, type) {
    console.log('Server created at url', url, type)
    cast(url)
    onExit(function() {
      server.close()
      if (!client.destroyed) {
        client.destroy()
      }
    })
  })
} else {
  setTimeout(function() {
    console.log('Starting http stream', url)
    cast(url)
  }, 5000)
}

var sigints = 0;
var playerState = null
var currentPlayer = null

function cast(url) {
  getPlayers.then(function(players) {
    if (!players.length) {
      return console.log('No playable devices on network')
    }
    players.some(function(player) {
      console.log('casting video to device', player.name, url)
      player.play(url, {title: 'Streamcaster Torrent'})
      player.on('status', function(status) {
        console.log('Player status', status)
        playerState = status
      })
      currentPlayer = player
      return player
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
    
    if (err) return readErrors(err)

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

function readErrors(err) {
  if (err && err.code !== 'SIGINT') {
      throw err;
  } else if (err) {
      if (sigints === 1) {
          process.exit(0);
      } else {
          sigints++;
          debug('Press ^C again to exit.');
          return next();
      }
  } else {
      sigints = 0;
  }
}
