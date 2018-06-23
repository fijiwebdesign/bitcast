var createTorrent = require('./module/createTorrent')

var path = process.argv[2]

console.log('Creating torrent for %s', path)

if (path) {
  createTorrent(path, (err, { torrent, parsedTorrent, magnet }) => {
    if (err) return console.log('Error %s', err)
    console.log('torrent is:', torrent)
    console.log('torrent info is:', parsedTorrent)
    console.log('magnet is: ', magnet)
  })
} else {
  showHelp()
}


function showHelp() {
  console.log(`
    Torrent URL or local file path required
      Usage: 
        node ./createTorrent.js [url or path]

      Example: 
        node ./createTorrent.js videos/SampleVideo_720x480_1mb.mp4
  `)
}