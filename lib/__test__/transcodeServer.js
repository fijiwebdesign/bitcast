var server = require('../server')
var onExit = require('../onExit')
var parseTorrent = require('parse-torrent')
var fs = require('fs')

var debug = require('debug')('bitcast:test:transcode-server')

var torrent = parseTorrent(fs.readFileSync('videos/SampleVideo_720x480_1mb.mkv.torrent'))

console.log('using torrent', torrent)

server(torrent, function(err, url, server, client, type) {
  if (err) {
    console.log('Server error', err)
    throw err
  }
  console.log('Server created at url', url, type)

  const webseed = 'http://' + server.address().address + ':8008/0'  // webtorrent -p 8001 videos/SampleVideo_720x480_1mb.mkv.torrent
  client.torrents[0].addWebSeed(webseed)
  
  onExit(function() {
    server.close()
    if (!client.destroyed) {
      client.destroy()
    }
  })
})