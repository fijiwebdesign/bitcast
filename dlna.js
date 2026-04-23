var MediaRenderer = require('upnp-mediarenderer-client')
var debug = require('debug')('bitcast:dlna')
var events = require('events')
var get = require('simple-get')
var mime = require('mime')
var os = require('os')
var parallel = require('run-parallel')
var parseString = require('xml2js').parseString

var SSDP
try {
  SSDP = require('node-ssdp').Client
} catch (err) {
  SSDP = null
}

var thunky = require('thunky')

var noop = function () {}

var DEFAULT_SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:schemas-upnp-org:device:MediaRenderer:2',
  'urn:schemas-upnp-org:service:AVTransport:1'
]

var DISCOVERY_INTERVAL = 10000

function getNetworkInterfaces () {
  var interfaces = os.networkInterfaces()
  var addresses = []
  Object.keys(interfaces).forEach(function (name) {
    interfaces[name].forEach(function (iface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name: name, address: iface.address })
      }
    })
  })
  return addresses
}

module.exports = function (opts) {
  opts = opts || {}
  var that = new events.EventEmitter()
  var casts = {}
  var ssdpClients = []
  var discoveryTimer = null
  var searchTargets = opts.searchTargets || DEFAULT_SEARCH_TARGETS
  var discoveryInterval = opts.discoveryInterval || DISCOVERY_INTERVAL

  that.players = []

  function handleSsdpResponse (headers, statusCode, info) {
    debug('ssdp.on response', headers, statusCode, info)
    if (!headers.LOCATION) return

    get.concat(headers.LOCATION, function (err, res, body) {
      if (err) {
        debug('Error requesting location', headers.LOCATION)
        return
      }

      parseString(body.toString(), {explicitArray: false, explicitRoot: false},
        function (err, service) {
          if (err) return
          if (!service.device) return

          debug('device %j', service.device)

          var name = service.device.friendlyName

          if (!name) return

          var host = info.address
          var xml = headers.LOCATION
          var key = name + '@' + host

          if (!casts[key]) {
            casts[key] = {name: name, host: host, xml: xml}
            return emit(casts[key])
          }

          if (casts[key] && !casts[key].host) {
            casts[key].host = host
            casts[key].xml = xml
            emit(casts[key])
          }
        })
    })
  }

  function createSsdpClients () {
    if (!SSDP) return

    var interfaces = getNetworkInterfaces()

    if (interfaces.length === 0) {
      debug('no network interfaces found, using default SSDP client')
      var client = new SSDP()
      client.on('response', handleSsdpResponse)
      ssdpClients.push(client)
      return
    }

    interfaces.forEach(function (iface) {
      debug('creating SSDP client on %s (%s)', iface.name, iface.address)
      try {
        var client = new SSDP({ sourcePort: 0, ssdpIp: iface.address })
        client.on('response', handleSsdpResponse)
        ssdpClients.push(client)
      } catch (err) {
        debug('failed to create SSDP client on %s: %s', iface.address, err.message)
      }
    })

    if (ssdpClients.length === 0) {
      debug('all per-interface clients failed, falling back to default')
      var fallback = new SSDP()
      fallback.on('response', handleSsdpResponse)
      ssdpClients.push(fallback)
    }
  }

  var emit = function (cst) {
    debug('Emit ', cst)
    if (!cst || !cst.host || cst.emitted) return
    cst.emitted = true

    var player = new events.EventEmitter()

    var connect = thunky(function reconnect (cb) {
      var client = new MediaRenderer(player.xml)

      client.on('error', function (err) {
        player.emit('error', err)
      })

      client.on('status', function (status) {
        if (status.TransportState === 'PLAYING') player._status.playerState = 'PLAYING'
        if (status.TransportState === 'PAUSED_PLAYBACK') player._status.playerState = 'PAUSED'
        player.emit('status', player._status)
      })

      client.on('loading', function (err) {
        player.emit('loading', err)
      })

      client.on('close', function () {
        connect = thunky(reconnect)
      })

      player.client = client
      cb(null, player.client)
    })

    var parseTime = function (time) {
      if (!time || time.indexOf(':') === -1) return 0
      var parts = time.split(':').map(Number)
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }

    player.name = cst.name
    player.host = cst.host
    player.xml = cst.xml
    player._status = {}
    player.MAX_VOLUME = 100

    player.play = function (url, opts, cb) {
      if (typeof opts === 'function') return player.play(url, null, opts)
      if (!opts) opts = {}
      if (!url) return player.resume(cb)
      if (!cb) cb = noop
      player.subtitles = opts.subtitles
      connect(function (err, p) {
        if (err) return cb(err)

        var media = {
          autoplay: opts.autoPlay !== false,
          contentType: opts.type || mime.lookup(url, 'video/mp4'),
          metadata: opts.metadata || {
            title: opts.title || '',
            type: 'video',
            subtitlesUrl: player.subtitles && player.subtitles.length ? player.subtitles[0] : null
          }
        }

        var callback = cb
        if (opts.seek) {
          callback = function () {
            player.seek(opts.seek, cb)
          }
        }

        p.load(url, media, callback)
      })
    }

    player.resume = function (cb) {
      if (!cb) cb = noop
      player.client.play(cb)
    }

    player.pause = function (cb) {
      if (!cb) cb = noop
      player.client.pause(cb)
    }

    player.stop = function (cb) {
      if (!cb) cb = noop
      player.client.stop(cb)
    }

    player.status = function (cb) {
      if (!cb) cb = noop
      parallel({
        currentTime: function (acb) {
          var params = {
            InstanceID: player.client.instanceId
          }
          player.client.callAction('AVTransport', 'GetPositionInfo', params, function (err, res) {
            if (err) return
            var position = parseTime(res.AbsTime) | parseTime(res.RelTime)
            acb(null, position)
          })
        },
        volume: function (acb) {
          player._volume(acb)
        }
      },
      function (err, results) {
        debug('%o', results)
        player._status.currentTime = results.currentTime
        player._status.volume = {level: results.volume / (player.MAX_VOLUME)}
        return cb(err, player._status)
      })
    }

    player._volume = function (cb) {
      var params = {
        InstanceID: player.client.instanceId,
        Channel: 'Master'
      }
      player.client.callAction('RenderingControl', 'GetVolume', params, function (err, res) {
        if (err) return
        var volume = res.CurrentVolume ? parseInt(res.CurrentVolume) : 0
        cb(null, volume)
      })
    }

    player.volume = function (vol, cb) {
      if (!cb) cb = noop
      var params = {
        InstanceID: player.client.instanceId,
        Channel: 'Master',
        DesiredVolume: (player.MAX_VOLUME * vol) | 0
      }
      player.client.callAction('RenderingControl', 'SetVolume', params, cb)
    }

    player.request = function (target, action, data, cb) {
      if (!cb) cb = noop
      player.client.callAction(target, action, data, cb)
    }

    player.seek = function (time, cb) {
      if (!cb) cb = noop
      player.client.seek(time, cb)
    }

    player._detectVolume = function (cb) {
      if (!cb) cb = noop
      player._volume(function (err, currentVolume) {
        if (err) cb(err)
        player.volume(player.MAX_VOLUME, function (err) {
          if (err) cb(err)
          player._volume(function (err, maxVolume) {
            if (err) cb(err)
            player.MAX_VOLUME = maxVolume
            player.volume(currentVolume, function (err) {
              cb(err, maxVolume)
            })
          })
        })
      })
    }

    that.players.push(player)
    that.emit('update', player)
  }

  createSsdpClients()

  that.update = function () {
    debug('querying ssdp on %d client(s)', ssdpClients.length)
    searchTargets.forEach(function (target) {
      ssdpClients.forEach(function (client) {
        client.search(target)
      })
    })
  }

  that.startDiscovery = function () {
    that.update()
    if (!discoveryTimer) {
      discoveryTimer = setInterval(function () {
        that.update()
      }, discoveryInterval)
    }
  }

  that.stopDiscovery = function () {
    if (discoveryTimer) {
      clearInterval(discoveryTimer)
      discoveryTimer = null
    }
  }

  that.destroy = function () {
    that.stopDiscovery()
    ssdpClients.forEach(function (client) {
      if (client.stop) client.stop()
    })
    ssdpClients = []
  }

  that.startDiscovery()

  return that
}
