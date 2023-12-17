import { AudioQuality } from "~/prisma/generated/mysql";
import Process from "./process";
import youtubeDl from "youtube-dl-exec";
import progress from "progress-estimator"
import Ffmpeg from "fluent-ffmpeg";
import { resolve } from "path";
import { createWriteStream } from "fs";
import { promisify } from "util";
import { finished } from "stream";
const logger = progress()

const ffmpeg = Ffmpeg()
const finishedFs = promisify(finished)
export default class ProcessVideo extends Process {

  async download() {
    const path = resolve(`${this.fileLocation}/source.mp4`)
    const promise = youtubeDl('https://www.youtube.com/watch?v=' + this.fileId, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      output: path,
      skipDownload: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    })
    const result = await logger(promise, "Downloading")

    const downloadLink = result.requested_downloads[0].requested_formats[0].url
    const writer = createWriteStream(`${this.fileLocation}/source.mp4`);
    return this.downloader.get(downloadLink, {
      responseType: "stream",
    })
      .then((res) => {
        res.data.pipe(writer);
        return finishedFs(writer);
      });
    
  }

  async getDuration(): Promise<number> {
    return 0
    return new Promise((solver, reject) => {
      Ffmpeg.ffprobe(`${this.fileLocation}/source.mp4`, (err, metadata) => {
        if (err) return reject(err);
        solver(metadata.format.duration ?? 0);
      })
    })
  }
  
  process() {

    // Convert mp4 to mp3
    
    return new Promise(async (resolve: (arg: Record<AudioQuality, string>) => void, reject) => {
      this.ffmpeg
      .input(this.fileLocation + "/source.mp4")
      .output(this.fileLocation + "/128k.mp3")
      .output(this.fileLocation + "/320k.mp3")
      .outputFormat("mp3")
      .audioCodec("libmp3lame")
      .audioBitrate(128000)
      .videoCodec("libx264")
      .videoBitrate(320000)
      .size("320x240")
      .on('progress', function(progress) {
        console.log('Processing: ' + progress.percent + '% done');
      })
      .on("end", () => {
          resolve({
            LOSSLESS: this.fileLocation + "/source.mp4",
            HIGH: this.fileLocation + "/320k.mp3",
            NORMAL: this.fileLocation + "/128k.mp3",
          })
        })
      .on("error", (err) => {
        reject(err)
        })
      .run()
    })
  }
}