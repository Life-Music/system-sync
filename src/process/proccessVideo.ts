import { AudioQuality } from "~/prisma/generated/mysql";
import Process from "./process";
import youtubeDl from "youtube-dl-exec";
import progress from "progress-estimator"
import Ffmpeg from "fluent-ffmpeg";
import { resolve } from "path";
import { createWriteStream, readFileSync } from "fs";
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
      extractAudio: true,
      skipDownload: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    })
    const result = await logger(promise, "Downloading")

    //@ts-ignore
    const downloadLink = result.requested_downloads[0].url ?? result.requested_downloads[0].requested_formats[0].url
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
    return new Promise((solver, reject) => {
      Ffmpeg.ffprobe(`${this.fileLocation}/source.mp4`, (err, metadata) => {
        if (err) return reject(err);
        solver(metadata.format.duration ?? 0);
      })
    })
  }

  async process(): Promise<Record<AudioQuality, string>> {

    // Convert mp4 to mp3
    const NORMAL = await this.processWithBitRate(this.fileLocation + "/source.mp4", this.fileLocation + "/128k.mp3", 128000)
    const HIGH = await this.processWithBitRate(this.fileLocation + "/source.mp4", this.fileLocation + "/320.mp3", 320000)
    const LOSSLESS = await this.processWithBitRate(this.fileLocation + "/source.mp4", this.fileLocation + "/source.mp3",)

    return {
      HIGH,
      NORMAL,
      LOSSLESS,
    }
  }

  uploadRaw(folderRawId: string, fileLocation: string): Promise<string> {
    const file = readFileSync(fileLocation)
    const fileName = fileLocation.split('/').pop() ?? new Date().getTime().toString()
    return this.oneDrive.upload(folderRawId, fileName, file)
  }
}