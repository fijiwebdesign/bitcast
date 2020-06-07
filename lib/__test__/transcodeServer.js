var server = require('../server')
var onExit = require('../onExit')

var debug = require('debug')('bitcast:test:transcode-server')

var magnet = '50FE428CCA091574B6EC832782B584102E57BB9A'
//var magnet = process.argv[2] 

server(magnet, function(err, url, server, client, type) {
  if (err) {
    console.log('Server error', err)
    throw err
  }
  console.log('Server created at url', url, type)
  
  onExit(function() {
    server.close()
    if (!client.destroyed) {
      client.destroy()
    }
  })
})