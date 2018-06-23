var createTorrent = require('create-torrent')
var parseTorrent = require('parse-torrent')
var fetch = require('isomorphic-fetch')
var concat = require('concat-stream')
var pump = require('pump')
var URL = require('url').URL;

var debug = require('debug')('streamcaster:createTorrent')

/**
 * Create torrent from URL or input supported by
 *  https://github.com/webtorrent/create-torrent
 * 
 * We create a magnet as it can contain all torrent information
 * Including pieceInfo which is included in the .torrent file
 * We reference the .torrent file url using the xs parameter in the magnet
 */
function createTorrentIsomorphic(url, opts = {}, cb) {

  if (arguments.length == 2) {
    cb = opts
    opts = {}
  } 
  if (!opts) {
    opts = {}
  }

  const onTorrentCreated = (err, torrent) => {
    if (err) {
      return cb && cb(err)
    }
    // TODO: lazy load these
    var parsedTorrent = parseTorrent(torrent)
    var magnet = parseTorrent.toMagnetURI(parsedTorrent)
    cb && cb(null, {
      torrent, parsedTorrent, magnet
    })
  }

  // HTTP URL
  if (url.match(/https?\:\/\//i)) {
    if (!opts.name) {
      opts.name = getNameFromUrl(url) || url
    }
    fetch(url)
      .then(res => res.body)
      .then(buffer => createTorrent(buffer, opts, onTorrentCreated))
      .catch(err => onTorrentCreated(err))
  // all others
  } else {
    createTorrent(url, opts, onTorrentCreated)
  }

}

function getNameFromUrl(url) {
  const path = new URL(url).pathname
  var filename
  if (path) {
    var matches = path.match(/([^/]+)$/i)
    if (matches) {
      filename = matches[1]
    }
  }
  return filename
}
 
function streamToBuffer(stream, cb) {
  pump(stream, concat(buf => cb(null, buf)), err => cb(err))
}

module.exports = createTorrentIsomorphic