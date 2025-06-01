var torrentServer = require('./lib/torrentServer')
var onExit = require('./lib/onExit')

var magnet = process.argv[2];

if (!magnet) {
  throw new Error('Please specify magnet argument')
}

function createServer(magnet, cb) {
  console.log('Starting torrent stream', magnet)
  torrentServer(magnet, function(url, server, client, type) {
    console.log('Server created at url', url, type)
    cb && cb(url)
    onExit(function() {
      server.close()
      if (!client.destroyed) {
        client.destroy()
      }
    })
  })
}

createServer(magnet, function(url) {
  console.log('url', url)
})