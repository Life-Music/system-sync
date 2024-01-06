import Process from "./process";
import { program } from "commander"
import Prisma, { AudioQuality, PrismaClient } from "~/prisma/generated/mysql"

export default class ProcessAudio extends Process {
  
  async process(): Promise<Record<AudioQuality, string>> {
    const NORMAL = await this.processWithBitRate(this.fileLocation + "/source.mp3", this.fileLocation + "/128k.mp3", 128000)
    const HIGH = await this.processWithBitRate(this.fileLocation + "/source.mp3", this.fileLocation + "/320.mp3", 320000)
    const LOSSLESS = await this.processWithBitRate(this.fileLocation + "/source.mp4", this.fileLocation + "/source_lossless.mp3",)

    return {
      HIGH,
      NORMAL,
      LOSSLESS,
    }
  }
}

program
.version("1.0.0")
.option("-f, --id <id>", "id of the file to be downloaded")
.parse(process.argv);

const options = program.opts();

const id = options.id ?? 1;

if(id) {
  void async function() {
    const prisma = new PrismaClient()

    const fileInfo = await prisma.audioResource.findFirstOrThrow({
      where: {
        id: id
      },
      include: {
        media: true
      }
    })
    
    const processAudio = new ProcessAudio(fileInfo.fileId)
    await processAudio.download()

    const duration = await processAudio.getDuration()

    try {
      await prisma.media.update({
        where: {
          id: fileInfo.mediaId
        },
        data: {
          duration,
        }
      })
    }
    catch(err) {
      console.error(err)
    }

    processAudio.process().then((res) => {
      console.log("Uploading into cloud...");
      
      return Promise.all([
        processAudio.upload(res.NORMAL),
        processAudio.upload(res.HIGH)
      ])
    })
    .then((res) => {
      return prisma.$transaction([
        prisma.audioResource.create({
          data: {
            fileId: res[0],
            label: "NORMAL",
            mediaId: fileInfo.mediaId
          },
        }),
        prisma.audioResource.create({
          data: {
            fileId: res[1],
            label: "HIGH",
            mediaId: fileInfo.mediaId
          },
        }),
        prisma.media.update({
          where: {
            id: fileInfo.mediaId
          },
          data: {
            status: "DONE"
          }
        })
      ])
    })
    .then((res) => {
      console.log("Cleaning up...");
      
      processAudio.destroy()
      console.log(res);
      prisma.$disconnect()
    })
  }()
}
