var express = require('express')
var rangeParser = require('range-parser')
var fs = require('fs')
var path = require('path')
var mime = require('mime-types')

var debug = require('debug')('bitcast:local-file-server')

var isFile = path => fs.existsSync(path) && fs.lstatSync(path).isFile()

var getLocalIp = () => {
  const { networkInterfaces } = require('os');

  const nets = networkInterfaces();
  const results = Object.create(null); // Or just '{}', an empty object

  for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
          if (net.family === 'IPv4' && !net.internal) {
              if (!results[name]) {
                  results[name] = [];
              }
              results[name].push(net.address);
          }
      }
  }
  return results["en0"][0]
}

/**
 * Create an HTTP server for a single file stream
 * @param {path} File path 
 * @param {Function} fn 
 */
function createFileServer(path, opts, fn) {
  var app = express()
  var contentType = mime.lookup(path)
  var videoStream = fs.createReadStream(path)
  var { host, port } = opts || { host: 'localhost', port: 8000 }

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
      var length = 253754403 // file.length // estimateLengthFromProgress(progress)
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

        videoStream.pipe(res)
      } else {
        res.setHeader('Content-Length', length)
        res.end()
      }

    }

    sendStream()

  });

  var server = app.listen(port, host, function (err) {
    if (typeof fn == 'function') {
      var ip = getLocalIp()
      var addr = 'http://' + ip + ':' + server.address().port + '/video'
      fn(err, addr, server, 'local:file')
    }
  })

}

module.exports = { createFileServer, isFile }