var express = require('express')
var Transcoder = require('stream-transcoder')
var rangeStream = require("range-stream")

function mainVideoFile(torrent) {
  return torrent.files.sort(
    (file1, file2) => 
    file1.size === file2.size ? 0 : (file1.size > file2.size ? -1 : 0)
  )[0]
}

/**
 * Create an HTTP MP4 transcoded video streaming server from a video/* stream
 * @param {Torrent} torrent 
 * @param {Function} fn 
 */
function createMp4TranscodeServer(torrent, fn) {
  var app = express()
  var file = mainVideoFile(torrent)
  var videoStream = file.createReadStream()
  var contentType = 'video/mp4'
  var mp4Stream = new Transcoder(videoStream)
    //.maxSize(320, 240)
    //.videoCodec('h264')
    //.videoBitrate(800 * 1000)
    //.fps(25)
    //.audioCodec('libfaac')
    //.sampleRate(44100)
    //.channels(2)
    //.audioBitrate(128 * 1000)
    .format('mp4')
    .on('finish', function() {
      console.log('transcode complete')
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
    console.log('requesting video', req.headers)
    const range = req.headers.range

    const dnlaContentFeatures = { 
      'contentFeatures.dlna.org': [
        'DLNA.ORG_PN=MATROSKA',
        'DLNA.ORG_OP=01',
        'DLNA.ORG_CI=0',
        'DLNA.ORG_FLAGS=01500000000000000000000000000000'
      ].join(';'),
      'transferMode.dlna.org': 'Streaming',
      'realTimeInfo.dlna.org': 'DLNA.ORG_TLAG=*'
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parseInt(parts[1], 10)

      if (!end) {
        throw new Error('End byte range required')
      }

      const chunksize = (end-start)+1
      const stream = mp4Stream.pipe(rangeStream(start, end))
      const head = {
        'Content-Range': `bytes ${start}-${end}/*`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      }
      console.log('sending mp4 stream')
      res.writeHead(206, head);
      stream.pipe(res)
    } else {
      const head = {
        // Todo: Video duration and attempt file size
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        ...dnlaContentFeatures
      }
      console.log('sending dnla')
      res.writeHead(200, head)
      //stream.pipe(res)
      res.end()
    }
  });

  var server = app.listen(PORT, HOST, function() {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/video'
    if (typeof fn == 'function') {
      fn(addr, server, client, 'mp4')
    }
  })

}

module.exports = createMp4TranscodeServer