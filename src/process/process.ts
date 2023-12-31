import OneDrive from "@src/adapters/OneDrive";
import "dotenv/config"
import oneDriveRequest from "../requests/oneDrive"
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { finished } from "stream";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg"


const finishedFs = promisify(finished)

export default class Process {
  oneDrive: OneDrive = new OneDrive({
    client_id: process.env.ONEDRIVE_CLIENT_ID ?? "",
    folder_root_id: process.env.ONEDRIVE_FOLDER_ROOT ?? "",
    username: process.env.ONEDRIVE_EMAIL ?? "",
    password: process.env.ONEDRIVE_PASSWORD ?? ""
  });

  downloader = oneDriveRequest
  ffmpeg = ffmpeg()

  fileId: string
  fileLocation: string
  constructor(fileId: string) {
    this.fileId = fileId;
    this.fileLocation = `./data/${this.fileId}`
    mkdirSync(this.fileLocation, {
      recursive: true
    })
  }

  async download() {
    const downloadInfo = await this.oneDrive.getFileInfo(this.fileId);
    const downloadLink = downloadInfo["@microsoft.graph.downloadUrl"]

    if (!existsSync(this.fileLocation)) {
      mkdirSync(this.fileLocation);
    }

    console.log("Downloading file: " + downloadLink);

    const writer = createWriteStream(`${this.fileLocation}/source.mp3`);
    return this.downloader.get(downloadLink, {
      responseType: "stream",
    })
      .then((res) => {
        res.data.pipe(writer);
        return finishedFs(writer);
      });
  }

  async upload(fileLocation: string) {
    const file = readFileSync(fileLocation)

    const fileInfo = await this.oneDrive.getFileInfo(this.fileId)

    const fileName = fileLocation.split("/").pop() ?? new Date().getTime().toString()
    return this.oneDrive.upload(fileInfo.parentReference.id, fileName, file);
  }

  async processWithBitRate(fileLocation: string, output: string, audioBitrate?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = this.ffmpeg
      .input(fileLocation)
      .addOption("-vn")
      .output(output)
      .outputFormat("mp3")
      .audioCodec("libmp3lame")

      if(audioBitrate) handler.audioBitrate(audioBitrate)

      handler
      .on('progress', function(progress) {
        console.log('Processing: ' + progress.percent + '% done');
      })
      .on("end", () => {
          resolve(output)
        })
      .on("error", (err) => {
        reject(err)
        })
      .run()   
    })
    
  }

  async process(): Promise<any> {

  }

  async getDuration(): Promise<number> {
    return new Promise((solver, reject) => {
      ffmpeg.ffprobe(`${this.fileLocation}/source.mp3`, (err, metadata) => {
        if (err) reject(err);
        solver(metadata.format.duration ?? 0);
      })
    })
  }

  async destroy() {
    if (existsSync(this.fileLocation)) {

      rmSync(this.fileLocation, { recursive: true, force: true });
    }
  }
}