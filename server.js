var WebTorrent = require('webtorrent')
var address = require('network-address')
var express = require('express')
var Transcoder = require('stream-transcoder')
 
var opts = null
var client = new WebTorrent()

function server(torrentId, fn) {
  console.log('starting streaming server...')
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

    createTorrentServer(torrent, function(addr) {
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
  server.listen(null, address(), function () {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/0'
    fn && fn(addr, server, client, 'torrent')
  })
}

/**
 * Create an HTTP MP4 transcoded video streaming server from a video/* stream
 * @param {Stream} stream 
 * @param {Function} fn 
 */
function createMp4StreamServer(file, fn) {
  var app = express()
  var stream = file.createReadStream()
  var contentType = 'video/mkv'
  var mp4Stream = new Transcoder(stream)
    .maxSize(320, 240)
    .videoCodec('h264')
    .videoBitrate(800 * 1000)
    .fps(25)
    .audioCodec('libfaac')
    .sampleRate(44100)
    .channels(2)
    .audioBitrate(128 * 1000)
    .format('mp4')
    .on('finish', function() {
      next();
    })
    .on('error', function(err) {
      console.log('An error occurred transcoding', file.path, err)
    })
    .stream()

  console.log('transcoding stream to mp4', file.path)

  app.get('/', function(req, res) {
    res.send('MP4 streaming server!')
  })

  app.get('/video', function(req, res) {
    console.log('requesting video', req)
    const path = file.path
    const fileSize = file.length
    const range = req.headers.range
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] 
        ? parseInt(parts[1], 10)
        : fileSize-1
      const chunksize = (end-start)+1
      const stream = file.createReadStream({start, end})
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      }
      res.writeHead(206, head);
      stream.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      }
      res.writeHead(200, head)
      stream.pipe(res)
    }
  });

  var server = app.listen(null, address(), function() {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/video'
    if (typeof fn == 'function') {
      fn(addr, server, client, 'mp4')
    }
  })

}

module.exports = server
