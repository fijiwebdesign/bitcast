var express = require('express'),
    StreamBodyParser = require('stream-body-parser'),
    Transcoder = require('stream-transcoder');

var app = express();

var bodyParser = new StreamBodyParser(app);

app.post('/:url', function(req, res) {
  fetch(req.params.url).then(function(res) {
    
  })
  var stream =  res.body
	new Transcoder(stream)
	    .maxSize(320, 240)
	    .videoCodec('h264')
	    .videoBitrate(800 * 1000)
	    .fps(25)
	    .audioCodec('libfaac')
	    .sampleRate(44100)
	    .channels(2)
	    .audioBitrate(128 * 1000)
	    .format('mp4')
	    .on('finish', function() {
	    	next();
	    })
	    .stream().pipe(res);
});

app.listen(3000);