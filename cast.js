var dlnacasts = require('./index')()
var server = require('./server')
var onExit = require('./lib/onExit')

var url = process.argv[2];

if (!url) {
  throw new Error('Please specify url argument')
}

var player = null
dlnacasts.on('update', function (_player) {
  console.log('Available players: ', dlnacasts.players.map(player => player.name))
  player = _player
})

if (!url.match(/^http/)) {
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
  console.log('Starting http stream', url)
  cast(url)
}

function cast(url) {
  if (!player) {
    return console.log('No playable devices on network')
  }
  console.log('casting video to device', player.name, url)
  player.play(url, {title: 'Streamcaster Torrent'})
}
