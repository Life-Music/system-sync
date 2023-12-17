import Process from "./process";
import { program } from "commander"
import Prisma, { PrismaClient } from "~/prisma/generated/mysql"

export default class ProcessAudio extends Process {
  
  process() {
    return new Promise(async (resolve: (arg: Record<Prisma.AudioQuality, string>) => void, reject) => {
      this.ffmpeg
      .input(this.fileLocation + "/source.mp3")
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
            LOSSLESS: this.fileLocation + "/source.mp3",
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
