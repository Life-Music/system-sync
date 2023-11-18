import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import axiosRetry from 'axios-retry';
axiosRetry(axios, { retries: 3 });

interface config {
  client_id: string,
  username: string,
  password: string,
  folder_root_id: string,
}

type tokenStorage = {
  access_token: string,
  refresh_token: string,
  expired_at: number
}

class OneDrive implements config {

  public client_id: string;
  public username: string;
  public password: string;
  public scope: string = 'user.read openid profile offline_access';
  public grant_type: string = 'password';
  public folder_root_id: string;

  public requestAdapter: AxiosInstance;

  public access_token: string = '';
  public access_token_expired_at: number = new Date().getTime();
  public refreshTokenTimer: NodeJS.Timeout | null = null;

  public constructor(config: config) {
    this.client_id = config.client_id;
    this.username = config.username;
    this.password = config.password;
    this.folder_root_id = config.folder_root_id;
    const instance = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0/me',
    });
    instance.interceptors.request.use(async (config) => {
      if (!this.access_token || this.access_token_expired_at - 1000 * 60 * 5 < new Date().getTime())
        await this.authentication();
      config.headers.Authorization = `Bearer ${this.access_token}`;
      return config;
    });
    axiosRetry(instance, {
      retries: 3,
      retryCondition(error) {
        return (error.code === 'EAI_AGAIN' ||
          error.code === 'ETIMEDOUT' ||
          error.response?.headers['retry-after'] ||
          error.response?.headers['Retry-After'] ||
          error.response?.status === 503 ||
          error.code === 'ECONNRESET') ? true : false;
      },
      retryDelay: (retryCount, error) => {
        const second = '45' || error.response?.headers['retry-after'] || error.response?.headers['Retry-After'];
        if (second) {
          return parseInt(second) * 1000;
        }
        return 3000;
      },
    });
    this.requestAdapter = instance;
    if (fs.existsSync('./onedrive.json')) {
      const file = fs.readFileSync('./onedrive.json').toString();
      const tokenObj: tokenStorage = JSON.parse(file) as tokenStorage;
      if (tokenObj.expired_at - 1000 * 60 * 5 < new Date().getTime()) {
        fs.unlinkSync('./onedrive.json');
        return;
      }
      this.access_token = tokenObj.access_token;
      this.access_token_expired_at = tokenObj.expired_at;
    }
  }

  public authentication() {
    console.log('[ONEDRIVE] - Re authentication...');
    const query = new URLSearchParams({
      client_id: this.client_id,
      scope: this.scope,
      username: this.username,
      password: this.password,
      grant_type: this.grant_type,
    });
    const form = query.toString();
    return axios.post<{
      access_token: string,
      refresh_token: string,
      expires_in: number,
    }>('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', form, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
      .then((res) => {
        const access_token = res.data.access_token;
        this.access_token = access_token;
        const accessTokenStorage: tokenStorage = {
          access_token,
          expired_at: new Date().getTime() + res.data.expires_in * 1000,
          refresh_token: res.data.refresh_token,
        };
        this.access_token_expired_at = accessTokenStorage.expired_at;
        fs.writeFileSync('./onedrive.json', JSON.stringify(accessTokenStorage, null, 2));
        return res.data;
      });
  }

  async getFileInfo(fileUID: string) {
		const res = await this.requestAdapter.get<{
      "@microsoft.graph.downloadUrl": string
      parentReference: {
        id: string
      }
    }>(`/drive/items/${fileUID}/`)
		return res.data
	}

  public async createUploadSession(folderId: string, fileName: string) {
    return this.requestAdapter.post(`/drive/items/${folderId}:/${fileName}:/createUploadSession`, {
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        'name': fileName,
      },
    })
      .then((res): {
        uploadUrl: string,
        expirationDateTime: string,
      } => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return res.data;
      });
  }

  public async getChildren(itemId: string) {
    const res = await this.requestAdapter<{
      value: {
        '@microsoft.graph.downloadUrl': string,
        name: string,
      }[],
    }>(`/drive/items/${itemId}/children`);
    const items = res.data.value.map((item) => {
      return {
        link: item['@microsoft.graph.downloadUrl'],
        name: item.name,
      };
    });
    return items;
  }

  public async createFolder(folderName: string, parentId = this.folder_root_id): Promise<string> {
    const res = await this.requestAdapter.post<{
      id: string
    }>(`/drive/items/${parentId}/children`, {
      name: folderName,
      'folder': {},
      '@microsoft.graph.conflictBehavior': 'replace',
    });
    console.log(`Created folder: ${folderName} - ${res.data.id}`);
    return res.data.id;
  }

  async uploadToURI(uri: string, buffer: Buffer, headers = {}) {
		return this.requestAdapter.put(uri, buffer, {
			headers: {
				"Content-Length": buffer.byteLength,
				"Content-Range": `bytes 0-${buffer.byteLength - 1}/${buffer.byteLength}`,
				...headers
			}
		})
			.then((res) => {
				return res.data
			})
			.catch((e) => {
				console.log(e);

			})
	}

  private async _upload(folderId: string, fileName: string, payload: any): Promise<string> {
		const buffer = Buffer.from(payload)
		if (buffer.byteLength < 4 * 1024 * 1024) {
			const res = await this.requestAdapter.put(`/drive/items/${folderId}:/${fileName}:/content`, buffer)
			return res.data.id
		}
		const sessionUpload = await this.createUploadSession(folderId, fileName)
		const res = await this.uploadToURI(sessionUpload.uploadUrl, buffer)
		return res.id
	}

	async upload(folderId: string, fileName: string, payload: any) {
		return await this._upload(folderId, fileName, payload)
	}
}

export default OneDrive;