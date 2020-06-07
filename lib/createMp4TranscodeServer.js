var express = require('express')
var Transcoder = require('stream-transcoder')
var rangeStream = require("range-stream")
var pump = require('pump')
var rangeParser = require('range-parser')
var transcodeEmitter = new (require('events').EventEmitter)()
var through = require('through2')
var fs = require('fs')
var path = require('path')
var TranscodedStream = require('./TranscodedStream')

var debug = require('debug')('bitcast:transcoder')

Transcoder.prototype.format = function (format) {
  this.args['format'] = ['-f', format];
  // ducktype 
  console.log('Transcoder', this)
  throw new Error()
  if (format.toLowerCase() == 'mp4') this.args['movflags'] = ['-movflags', 'frag_keyframe+faststart'];
  return this;
};

function dirExists(path) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory()
}

function mainVideoFile(torrent) {
  return torrent.files.sort(
    (file1, file2) =>
      file1.size === file2.size ? 0 : (file1.size > file2.size ? -1 : 0)
  )[0]
}

let transcodeProgress = {}
function estimateLengthFromProgress({ size, progress }) {
  return size * 100 / progress
}

/*
progress = {
  frame: 430,
  fps: 370,
  size: 7318528,
  time: 102001,
  bitrate: 573000,
  progress: 0.017875863509656552
}
*/

/**
 * Create an HTTP MP4 transcoded video streaming server from a video/* stream
 * @param {Torrent} torrent 
 * @param {Function} fn 
 */
function createMp4TranscodeServer(torrent, { host, port }, fn) {
  var app = express()
  var file = mainVideoFile(torrent)
  var contentType = 'video/mp4'
  var videoStream = file.createReadStream()
  var writeDirPath = '/tmp/bitcast'
  var writeFilePath = path.join(writeDirPath, torrent.infoHash)
  var mp4Stream = new Transcoder(videoStream)
    //.maxSize(320, 240)
    .videoCodec('h264')
    //.videoBitrate(800 * 1000)
    //.fps(25)
    //.audioCodec('libfaac')
    //.sampleRate(44100)
    //.channels(2)
    //.audioBitrate(128 * 1000)
    .format('mp4')
    .on('progress', progress => {
      console.log('progress', progress)
      transcodeProgress = progress
      transcodeEmitter.emit('progress', progress)
    })
    .on('finish', function () {
      console.log('transcode complete')
    })
    .on('error', function (err) {
      console.log('An error occurred transcoding', file.path, err)
    })
    .stream()

  if (!dirExists(writeDirPath)) {
    console.log('Creating directory', writeDirPath)
    fs.mkdirSync(writeDirPath)
  }
  console.log('writing transcode to', writeFilePath)
  mp4Stream.pipe(fs.createWriteStream(writeFilePath))

  console.log('transcoding stream to mp4', file.path)

  app.get('/', function (req, res) {
    res.send('MP4 streaming server!')
  })

  app.get('/video', function (req, res) {
    console.log('requesting video', req.headers)

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.statusCode = 200

    // Support DLNA streaming
    res.setHeader('transferMode.dlna.org', 'Streaming')
    res.setHeader(
      'contentFeatures.dlna.org',
      'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    )

    if (req.method === 'HEAD') res.end()

    const sendStream = progress => {
      var length = file.length   * 1000000 // estimateLengthFromProgress(progress)
      console.log('sending video stream', { progress, length })
      if (req.headers.range) {
        res.statusCode = 206
        // no support for multi-range reqs
        const { start, end } = rangeParser(length, req.headers.range)[0]
        debug('range', { start, end })
        res.setHeader(
          'Content-Range',
          'bytes ' + start + '-' + end + '/' + length
        )
        res.setHeader('Content-Length', end - start + 1)
        debug('webseed: pumping to response stream: ', { start, end })

        /*
        const transcode = require('transcode-stream') 
        pump(videoStream, transcode({
          vcodec: 'h264',
          acodec: 'mp3'
        }), rangeStream(start, end), res)
        */

        const transcodedStream = new TranscodedStream(transcodeEmitter, writeFilePath, { start, end })
        transcodedStream.on('error', error => {
          throw error
        })
        pump(transcodedStream, res)
      } else {
        res.setHeader('Content-Length', length)
        res.end()
      }

    }

    sendStream()

  });

  var server = app.listen(port, host, function (err) {
    var addr = 'http://' + server.address().address + ':' + server.address().port + '/video'
    if (typeof fn == 'function') {
      fn(err, addr, server, 'transcode:mp4')
    }
  })

}

module.exports = createMp4TranscodeServer