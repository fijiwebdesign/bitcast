var WebTorrent = require('webtorrent')
var os = require('os')
var createMp4TranscodeServer = require('./createMp4TranscodeServer')

var client = new WebTorrent()
var HOST = process.env.HOST || '0.0.0.0'
var PORT = process.env.PORT || null

function getLocalAddresses () {
  var interfaces = os.networkInterfaces()
  var addresses = []
  Object.keys(interfaces).forEach(function (name) {
    interfaces[name].forEach(function (iface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address)
      }
    })
  })
  return addresses
}

function closestAddress (targetHost) {
  var addresses = getLocalAddresses()
  if (addresses.length === 0) return 'localhost'
  if (addresses.length === 1) return addresses[0]

  var targetParts = targetHost.split('.')
  var best = addresses[0]
  var bestScore = 0

  addresses.forEach(function (addr) {
    var parts = addr.split('.')
    var score = 0
    for (var i = 0; i < 4; i++) {
      if (parts[i] === targetParts[i]) score++
      else break
    }
    if (score > bestScore) {
      bestScore = score
      best = addr
    }
  })

  return best
}

function fileIsMp4(file) {
  return file.path.match(/\.mp4$/i)
}

function mainVideoFile(torrent) {
  return torrent.files.sort(
    (file1, file2) =>
    file1.size === file2.size ? 0 : (file1.size > file2.size ? -1 : 0)
  )[0]
}

function mainVideoFileIndex(torrent) {
  const file = mainVideoFile(torrent)
  return torrent.files.indexOf(file)
}

function server(torrentId, cb) {
  console.log('starting streaming server...', torrentId)
  client.add(torrentId, function (torrent) {
    torrent.on('ready', function () {
      console.log('metadata received', JSON.stringify(torrent.files))
    })
    torrent.on('noPeers', function (announceType) {
      console.log('No peers available for torrent', torrent)
    })
    setInterval(function (bytes) {
      console.log('progress: ' + torrent.progress*100 + '%')
    }, 5000)

    const videoFile = mainVideoFile(torrent)
    const isMp4 = fileIsMp4(videoFile)
    console.log('File is', videoFile.path, isMp4 ? ' mp4' : ' will be transcoded to mp4')

    const createStreamServer = isMp4 ? createTorrentServer : createMp4TranscodeServer
    createStreamServer(torrent, { host: HOST, port: PORT }, function(err, addr, server, type) {
      if (!err) console.log('Torrent Server listening on ', addr)
      if (typeof cb === 'function') {
        cb(err, addr, server, client, type)
      }
    })

  })
}

function createTorrentServer(torrent, { host, port}, fn) {
  var server = torrent.createServer()
  server.listen(port, host, function (err) {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/' + mainVideoFileIndex(torrent)
    fn && fn(err, addr, server, 'torrent:mp4')
  })
}

server.closestAddress = closestAddress
server.getLocalAddresses = getLocalAddresses

module.exports = server
