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

  async process(): Promise<any> {

  }

  async destroy() {
    if (existsSync(this.fileLocation)) {
      
      rmSync(this.fileLocation, { recursive: true, force: true });
    }
  }
}