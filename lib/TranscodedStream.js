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
class TranscodedFileStream extends stream.Readable {
  constructor (transcoderEmitter, writeFilePath, opts) {
    super(opts)
    const { start, end, transcodeFinished } = opts
    this.transcoderEmitter = transcoderEmitter
    this.writeFilePath = writeFilePath
    this.start = start || 0
    this.end = end | Infinity
    this.transcodeFinished = transcodeFinished
    this.currStart = 0
    this.currEnd = 0
    this._reading = false
    this._notifying = false
    this.transcoderEmitter.on('finish', () => this.transcodeFinished = true)
    debug("new TranscodedStream", this)
  }

  _read () {
    debug("read called", this._reading)
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
    const { size:fileSize } = fs.lstatSync(this.writeFilePath)
    const { start, end } = this
    const currStart = this.currEnd
    const currEnd = this.currEnd = Math.min(fileSize, end)
    const readableSize = currEnd - currStart
    debug('attempt push', { start, end, currStart, currEnd, fileSize, readableSize })
    if (this.currStart < this.currEnd) {
      this._notifying = false
      debug('reading from transcoded file', { start, end, currEnd, currStart, fileSize, readableSize })
      var transcodedFileStream = fs.createReadStream(this.writeFilePath, { start: currStart, end: currEnd })
      var totalReadSize = 0
      transcodedFileStream
        .on('data', (chunk) => {
          this.push(chunk)
          totalReadSize += chunk.length
        })
        .on('error', error => this.emit('error', error))
        .on('end', () => {
          debug('reading transcoded chunk finished. pushed: ', { totalReadSize, readableSize })
          if (totalReadSize !== readableSize) debug('readsize mismatch', { totalReadSize, readableSize })
          this.currEnd = currStart + totalReadSize // fix mismatch
          if (!this.transcodeFinished && end > this.currEnd) {
            //return this._pushChunk()
          }
          this._reading = false
        })
        this.on('close', () => {
          debug('closing TranscodedFileStream and destroying transcodedFileStream range', { })
          transcodedFileStream.destroy()
        })
    } else {
      debug('waiting for transcoder', { start, end, currEnd, fileSize })
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

module.exports = TranscodedFileStream