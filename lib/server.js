var WebTorrent = require('webtorrent')
var address = require('network-address')
var createMp4TranscodeServer = require('./createMp4TranscodeServer')
var config = require('../config') 

var client = new WebTorrent()
var HOST = process.env.HOST || config.host || address() || 'localhost'
var PORT = process.env.PORT || config.port || null

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

function server(torrentId, fn) {
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
    createStreamServer(torrent, function(addr) {
      console.log('Torrent Server listening on ', addr)
      if (typeof fn == 'function') {
        fn.apply(null, arguments)
      }
    })

  })
}

/**
 * Create a HTTP video streaming server for the torrent
 * @param {Torrent} torrent 
 * @param {Function} fn 
 */
function createTorrentServer(torrent, fn) {
  var server = torrent.createServer()
  server.listen(PORT, HOST, function () {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/' + mainVideoFileIndex(torrent)
    fn && fn(addr, server, client, 'torrent')
  })
}

module.exports = server
