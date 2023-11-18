import axios from "axios";
import axiosRetry from 'axios-retry';

const oneDriveRequest = axios.create({})

axiosRetry(axios, { retries: 3 });

export default oneDriveRequest

