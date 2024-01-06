import { PrismaClient } from "~/prisma/generated/mysql";
import GoogleAuth from "./adapters/GoogleAuth";
import ProcessVideo from "./process/proccessVideo";
import elasticSearch from './adapters/ElasticSearch';


const prisma = new PrismaClient();
  void async function() {

    const accounts = await prisma.socialAccount.findMany({
      where: {
        disabledAt: null
      }
    })

    for (const account of accounts) {
      console.log("Checking in account: ",account.userId);
      let token = account.accessToken;
      let refreshToken = account.refreshToken;
      let expiredAt = account.expiredAt;
      
      const google = new GoogleAuth()
      if(expiredAt.getTime() < new Date().getTime() - 10 * 60 * 1000) {
        console.log("Token has been expired, refreshing it...");
        
        if(!refreshToken) {
          console.log("Cannot refresh token, skipping");
          continue
        }
        const tokenInfo = await google.refreshToken(refreshToken);
        await prisma.socialAccount.update({
          where: {
            id: account.id,
          },
          data: {
            accessToken: tokenInfo.access_token,
            refreshToken: tokenInfo.refresh_token,
            expiredAt: new Date(tokenInfo.expires_in * 1000 + new Date().getTime())
          }
        })

        token = tokenInfo.access_token;
      }

      if(!token) {
        console.log("Cannot get token, skipping");
        continue
      }

      const playlistId = await google.getPlaylist(token);
      const videos = await google.getVideos(playlistId, token);

      for (const video of videos) {
        const check = await prisma.mediaOnSocialAccount.findFirst({
          where: {
            socialAccountId: account.id,
            mediaSocialId: video.videoId,
          }
        })
        if(!check) {
          console.log("Detected new video: ",video.videoId);
          const media = await prisma.media.create({
            data: {
              ...video.media,
              userId: account.userId,
              owner: undefined,
              viewMode: "PUBLIC",
              MediaOnSocialAccount: {
                create: {
                  mediaSocialId: video.videoId,
                  socialAccountId: account.id,
                }
              }
            }
          })

          await elasticSearch.index({
            index: 'media',
            id: media.id.toString(),
            document: {
              id: media.id.toString(),
              name: media.title,
              status: media.status,
              published_at: media.publishedAt,
              locked_at: media.lockedAt,
              view_mode: media.viewMode,
            },
          });

          const processAudio = new ProcessVideo(video.videoId)
          await processAudio.download()

          const duration = await processAudio.getDuration()

          try {
            await prisma.media.update({
              where: {
                id: media.id
              },
              data: {
                duration,
              }
            })
          }
          catch(err) {
            console.error(err)
          }

          const folderMediaId = await processAudio.oneDrive.createFolder(media.id);
          const folderRawId = await processAudio.oneDrive.createFolder('RAW', folderMediaId);
      
          await processAudio.process().then((res) => {
            console.log("Uploading into cloud...");
            
            return Promise.all([
              processAudio.uploadRaw(folderRawId, res.LOSSLESS),
              processAudio.uploadRaw(folderRawId, res.HIGH),
              processAudio.uploadRaw(folderRawId, res.NORMAL),
            ])
          })
          .then((res) => {
            return prisma.$transaction([
              prisma.audioResource.create({
                data: {
                  fileId: res[0],
                  label: "LOSSLESS",
                  mediaId: media.id
                },
              }),
              prisma.audioResource.create({
                data: {
                  fileId: res[0],
                  label: "NORMAL",
                  mediaId: media.id
                },
              }),
              prisma.audioResource.create({
                data: {
                  fileId: res[1],
                  label: "HIGH",
                  mediaId: media.id
                },
              }),
              prisma.media.update({
                where: {
                  id: media.id
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
        }
        else {
          console.log("Has been in database, skipping: ",video.videoId);
        }
      }
    }
    
  }()
