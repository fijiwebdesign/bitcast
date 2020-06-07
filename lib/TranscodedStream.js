const debug = require('debug')('bitcast:transcoded-stream')
const stream = require('readable-stream')
const fs = require('fs')
const through = require('through2')

/**
 * Readable stream of a transcoded stream
 *
 * @param {Transcoder} transcoder
 * @param {Object} opts
 * @param {number} opts.start stream slice of stream, starting from this byte (inclusive)
 * @param {number} opts.end stream slice of stream, ending with this byte (inclusive)
 */
class TranscodedStream extends stream.Readable {
  constructor (transcoderEmitter, writeFilePath, { start, end } = {}) {
    super()
    this.transcoderEmitter = transcoderEmitter
    this.writeFilePath = writeFilePath
    this.start = start || 0
    this.end = end | Infinity
    this.currStart = 0
    this.currEnd = 0
  }

  _read () {
    debug("read called")
    if (this._reading) return
    this._reading = true
    this._notify()
  }

  _notify () {
    debug("notify called")
    if (!this._reading) return
    if (this._notifying) return
    this._notifying = true
    this._pushChunk()
  }

  _pushChunk () {
    debug("pushChunk called")
    const { size } = fs.lstatSync(this.writeFilePath)
    this.currStart = this.currEnd
    this.currEnd = Math.min(size, this.end)
    debug('attempt push', { start: this.start, end: this.end, currEnd: this.currEnd, size })
    if (this.currStart < this.currEnd) {
      this._notifying = false
      debug('streaming transcoded', { start: this.start, end: this.end, currEnd: this.currEnd, size })
      var transcodedStream = fs.createReadStream(this.writeFilePath, { start: this.currStart, end: this.currEnd })
      transcodedStream
        .on('readable', () => {
          var chunk;
          while (null !== (chunk = transcodedStream.read())) {
            this.push(chunk);
          }
        })
        .on('error', error => this.emit('error', error))
        .on('end', () => {
          debug('streaming transcoded chunk finished')
          this._reading = false
        })
    } else {
      debug('waiting for transcoder', { start: this.start, end: this.end, currEnd: this.currEnd, size })
      this.transcoderEmitter.once('progress', () => {
        this._pushChunk()
      })
    }
  }

  destroy (onclose) {
    this._destroy(null, onclose)
  }

  _destroy (err, onclose) {
    if (this.destroyed) return
    this.destroyed = true
    if (err) this.emit('error', err)
    this.emit('close')
    if (onclose) onclose()
  }
}

module.exports = TranscodedStream