# bitcast

Stream video from BitTorrent and cast directly to DNLA/Upnp media renders (Smart TV)

Query your local network for DLNA media renderers and have them play media

API (and code) based on:

 * dlnacasts - https://github.com/grunjol/dlnacasts
 * mafintosh/chromecasts for DLNA

```
git clone https://github.com/fijiwebdesign/bitcast.git
```

## Usage

### CLI

``` 
node cast.js [magnet or url]
```


### Node.js 

Current Node.js API is that of `dlnacasts` https://github.com/grunjol/dlnacasts

``` js
var dlnacasts = require('index')()

dlnacasts.on('update', function (player) {
  console.log('all players: ', dlnacasts.players)
  player.play('http://example.com/my-video.mp4', {title: 'my video', type: 'video/mp4'})
})
```

Create a torrent streaming server and cast the URL to your smart TV

``` js

var server = require('./server')
var dlnacasts = require('index')()

var magnet = 'magnet:?xt=urn:btih:ab3f1350ebe4563a710545d0e33e09a7b7943ecf&dn=awakening-new-zealand-4k.mp4&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Ffastcast.nz%2Fdownloads%2Fawakening-new-zealand-4k.mp4&ws=https%3A%2F%2Fwebseed.btorrent.xyz%2Fawakening-new-zealand-4k.mp4'

dlnacasts.on('update', function (player) {
  console.log('Cast url', url, 'to player', player.name)

  server(magnet, function(url) {
    player.play(url, {title: 'my video', type: 'video/mp4'})
  })
  
})

```

## API


### Torrent Server

#### `server(magnet, cb)`

Creates an HTTP server on random port that streams the torrent from magnet. 

Magnet can be any torrentId supported by webtorrent. https://github.com/webtorrent/webtorrent

The callback `cb` must be a function with signature: 

``` js
function (url, server, client, type) {}
```

The `url` is the URL of the main video file to be streamed. 

The `server` is the `express` or node.js `server` instance. 

The `client` is the `webtorrent` instance

The `type` is a string representing the server type (torrent|mp4) where mp4 is transcoding server for mp4 video playable by HTML5. 


### DNLA

#### `var list = dlnacasts()`

Creates a dlna list.
When creating a new list it will call `list.update()` once.

#### `list.update()`

Updates the player list by querying the local network for DLNA renderer instances.

#### `list.on('update', player)`

Emitted when a new player is found on the local network

#### `player.play(url, [opts], cb)`

Make the player play a url. Options include:

``` js
{
  title: 'My movie',
  type: 'video/mp4',
  seek: seconds, // start by seeking to this offset
  subtitles: ['http://example.com/sub.vtt'], // subtitle track 1,
  autoSubtitles: true // enable first track if you provide subs
}
```

#### `player.subtitles(track, [cb])`

Enable subtitle track. Use `player.subtitles(false)` to disable subtitles

#### `player.pause([cb])`

Make the player pause playback

#### `player.resume([cb])`

Resume playback

#### `player.stop([cb])`

Stop the playback

#### `player.seek(seconds, [cb])`

Seek the video

#### `player.status(cb)`

Get a status object of the current played video.

#### `player.on('status', status)`

Emitted when a status object is received.

## License

MIT
