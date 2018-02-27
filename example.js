var dlnacasts = require('./index')()


var url = process.argv[2];

if (!url) {
  throw new Error('Please specify url argument')
}

dlnacasts.on('update', function (player) {
  console.log('all players: ', dlnacasts.players)
  player.play(url, {title: 'my video', type: 'video/mp4'})
})

console.log('starting...')

setTimeout(() => console.log('done!'), 10000)