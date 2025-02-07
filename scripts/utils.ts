import { TwitterOpenApi } from "twitter-openapi-typescript";
import axios from "axios";
import { TwitterApi } from 'twitter-api-v2';

const https = require('https');

// const testConnectivity = async () => {
//   try {
//     // 发送请求到 google.com 测试网络连通性
//     const response = await axios.get('https://www.google.com',{
//       proxy: {
//         host: '127.0.0.1',
//         port: 7890
//       }
//   });
    
//     // 如果响应状态码是 200，表示连接成功
//     if (response.status === 200) {
//       console.log('成功连接到 google.com');
//     }
//   } catch (error) {
//     if (error instanceof Error) {
//       // 这里 TypeScript 知道 error 是一个 Error 对象
//       console.error("Error message: ", error.message);
//     } else {
//       console.error("An unknown error occurred");
//     }
//   }
// };

// testConnectivity();


export const _xClient = async (TOKEN: string) => {
  console.log("🚀 ~ const_xClient= ~ TOKEN:", TOKEN)
  const resp = await axios.get("https://x.com/manifest.json", {
    headers: {
      cookie: `auth_token=${TOKEN}`,
    },
   //httpsAgent: new https.Agent({ rejectUnauthorized: false }) // 忽略证书验证
  });
  
  const resCookie = resp.headers["set-cookie"] as string[];
  const cookieObj = resCookie.reduce((acc: Record<string, string>, cookie: string) => {
    const [name, value] = cookie.split(";")[0].split("=");
    acc[name] = value;
    return acc;
  }, {});

  console.log("🚀 ~ cookieObj ~ cookieObj:", JSON.stringify(cookieObj, null, 2))

  const api = new TwitterOpenApi();
  const client = await api.getClientFromCookies({...cookieObj, auth_token: TOKEN});
  return client;
};

export const xGuestClient = () => _xClient(process.env.GET_ID_X_TOKEN!);
export const XAuthClient = () => _xClient(process.env.AUTH_TOKEN!);


export const login = async (AUTH_TOKEN: string) => {
  const resp = await axios.get("https://x.com/manifest.json", {
    headers: {
      cookie: `auth_token=${AUTH_TOKEN}`,
    },
   //httpsAgent: new https.Agent({ rejectUnauthorized: false }) // 忽略证书验证
  });
  
  const resCookie = resp.headers["set-cookie"] as string[];
  const cookie = resCookie.reduce((acc: Record<string, string>, cookie: string) => {
    const [name, value] = cookie.split(";")[0].split("=");
    acc[name] = value;
    return acc;
  }, {});
  cookie.auth_token = AUTH_TOKEN;

  const api = new TwitterOpenApi();
  const client = await api.getClientFromCookies(cookie);

  const plugin = {
    onBeforeRequest: async (params: any) => {
      params.computedParams.headers = {
        ...params.computedParams.headers,
        ...client.config.apiKey,
        'x-csrf-token': cookie.ct0,
        'x-twitter-auth-type': 'OAuth2Session',
        authorization: `Bearer ${TwitterOpenApi.bearer}`,
        cookie: api.cookieEncode(cookie),
      };
      params.requestOptions.headers = {
        ...params.requestOptions.headers,
        ...client.config.apiKey,
        'x-csrf-token': cookie.ct0,
        'x-twitter-auth-type': 'OAuth2Session',
        authorization: `Bearer ${TwitterOpenApi.bearer}`,
        cookie: api.cookieEncode(cookie),
      };
    },
  };

  const legacy = new TwitterApi('_', { plugins: [plugin] });

  return { client, legacy };
}
