import { Client } from '@elastic/elasticsearch';

const elasticSearch = new Client({
  node: process.env.ELASTIC_SEARCH_ENDPOINT,
  auth: {
    username: process.env.ELASTIC_SEARCH_USERNAME ?? "",
    password: process.env.ELASTIC_SEARCH_PASSWORD ?? "",
  },
});
export default elasticSearch;