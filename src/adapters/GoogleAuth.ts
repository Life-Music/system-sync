import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Prisma } from '~/prisma/generated/mysql';
axiosRetry(axios, { retries: 3 });

const client_id = "330225899302-ea4o65k70b3f1sch72rm80hf33atucou.apps.googleusercontent.com"
const client_secret = "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"
const grant_type = "authorization_code"

export default class GoogleAuth {

  public getToken(code: string) {
    const endpoint = 'https://oauth2.googleapis.com/token';

    return axios.post(endpoint, {
      code,
      client_id,
      client_secret,
      redirect_uri: "http://localhost:5175/management/youtube-puller/auth",
      grant_type,
    })
      .then((res) => res.data);
  }

  public refreshToken(refresh_token: string) {
    const endpoint = 'https://oauth2.googleapis.com/token';

    return axios.post(endpoint, {
      client_id,
      client_secret,
      grant_type: "refresh_token",
      refresh_token,
    })
      .then((res) => res.data);
  }

  public getPlaylist(access_token: string) {
    const endpoint = 'https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true'

    return axios.get(endpoint, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })
    .then((res) => res.data.items[0].contentDetails.relatedPlaylists.uploads);
  }

  public getVideos(playlistId: string, access_token: string): Promise<Array<{
    media: Prisma.MediaCreateInput,
    videoId: string
  }>> {
    const endpoint = `https://youtube.googleapis.com/youtube/v3/playlistItems`

    return axios.get(endpoint, {
      params: {
        part: 'snippet,contentDetails,status',
        playlistId,
        maxResults: 50,
      },
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })
   .then((res) => {
      return res.data.items.map((item: any) => {
        return {
          media: {
            title: item.snippet.title,
            detail: {
              create: {
                description: item.snippet.description,
              }
            },
            thumbnails: {
              create: {
                url: item.snippet.thumbnails.high.url,
              }
            },
            viewMode: item.status.privacyStatus === "private" ? "PRIVATE" : "PUBLIC",
          },
          videoId: item.contentDetails.videoId,
        }
      })
   });
  }

  public getUserInfo(accessToken: string) {

    return axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((res) => res.data);
  }
}